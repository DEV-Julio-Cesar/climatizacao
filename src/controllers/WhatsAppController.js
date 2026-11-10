const ContasWhatsApp = require('../services/WhatsAppContaService');
const crypto = require('crypto');
const db = require('../config/database');
const Automacao = require('../services/WhatsAppAutomacaoService');
const logger = require('../config/logger');

const normalizar = (valor) => String(valor || '').replace(/\D/g, '');

async function nomeDoAtendente(usuario, executor = db) {
  const result = await executor.query('SELECT nome FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE', [usuario.usuario_id, usuario.empresa_id]);
  return result.rows[0]?.nome || 'Atendente';
}

async function enviarERegistrar(conversaId, telefone, texto, usuarioId, empresaId, executor = db) {
  const canal=await ContasWhatsApp.paraEmpresa(empresaId);
  const retorno = await canal.enviarMensagem(telefone, texto);
  if (!retorno?.messages?.[0]?.id) throw new Error('Envio sem confirmacao.');
  const mensagem = await executor.query(
    `INSERT INTO whatsapp_mensagens(conversa_id,whatsapp_id,direcao,tipo,conteudo,status,enviado_por)
     VALUES($1,$2,'SAIDA','text',$3,'enviada',$4) RETURNING *`,
    [conversaId, retorno?.messages?.[0]?.id || null, texto, usuarioId]
  );
  return mensagem.rows[0];
}

class WhatsAppController {
  verificarWebhook(req, res) {
    const modo = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const desafio = req.query['hub.challenge'];
    if (modo === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(desafio);
    return res.sendStatus(403);
  }

  async receberWebhook(req, res) {
    const segredo=process.env.WHATSAPP_APP_SECRET, assinatura=req.get('x-hub-signature-256');
    if(!segredo)return res.status(503).json({erro:'Webhook indisponivel.'});
    if(!req.rawBody)return res.sendStatus(401);
    const esperada='sha256='+crypto.createHmac('sha256',segredo).update(req.rawBody).digest('hex');
    if(typeof assinatura!=='string'||Buffer.byteLength(assinatura)!==Buffer.byteLength(esperada)||!crypto.timingSafeEqual(Buffer.from(assinatura),Buffer.from(esperada)))return res.sendStatus(401);
    if(!Array.isArray(req.body.entry))return res.sendStatus(400);
    try {
      for(const entrada of req.body.entry)for(const alteracao of Array.isArray(entrada.changes)?entrada.changes:[]){
        const valor=alteracao.value||{}, destino=await ContasWhatsApp.identificar(valor.metadata?.phone_number_id,'');
        if(!destino)continue;
        for(const status of Array.isArray(valor.statuses)?valor.statuses:[])await db.query('UPDATE whatsapp_mensagens m SET status=$1 FROM whatsapp_conversas w WHERE m.conversa_id=w.id AND m.whatsapp_id=$2 AND w.empresa_id=$3',[String(status.status||'enviada').slice(0,30),status.id,destino.empresa_id]);
        for(const mensagem of Array.isArray(valor.messages)?valor.messages:[]){
          const telefone=normalizar(mensagem.from);
          if(!telefone||telefone.length>20||typeof mensagem.id!=='string'||!mensagem.id||mensagem.id.length>150)continue;
          const vinculo=await ContasWhatsApp.identificar(valor.metadata?.phone_number_id,telefone);if(!vinculo?.empresa_id)continue;
          const contato=(Array.isArray(valor.contacts)?valor.contacts:[]).find(item=>normalizar(item.wa_id)===telefone);
          await Automacao.receber({empresaId:vinculo.empresa_id,clienteId:vinculo.cliente_id,telefone,nomeContato:contato?.profile?.name,mensagem});
        }
      }
      return res.sendStatus(200);
    }catch(error){logger.erro('whatsapp.webhook',{erro_codigo:error.code||'WEBHOOK_ERROR'});return res.sendStatus(503);}
  }

  async listarConversas(req, res) {
    try {
      const result = await db.query(
        `SELECT w.*,c.nome AS cliente_nome,u.nome AS atendente_nome,
         (SELECT COUNT(*)::int FROM whatsapp_respostas_bot q WHERE q.conversa_id=w.id AND q.concluido_em IS NULL AND q.cancelado_em IS NULL) AS bot_pendentes,
         (SELECT q.ultimo_erro FROM whatsapp_respostas_bot q WHERE q.conversa_id=w.id ORDER BY q.id DESC LIMIT 1) AS bot_ultimo_erro
         FROM whatsapp_conversas w
         LEFT JOIN clientes c ON c.id=w.cliente_id LEFT JOIN usuarios u ON u.id=w.atendente_id
         WHERE w.empresa_id=$1 AND w.encerrado_em IS NULL AND (w.fila_status<>'ATENDENDO' OR w.atendente_id=$2)
         ORDER BY w.ultima_mensagem_em DESC NULLS LAST,w.updated_at DESC LIMIT 300`,
        [req.usuarioLogado.empresa_id, req.usuarioLogado.usuario_id]
      );
      return res.json(result.rows);
    } catch (error) { return res.status(500).json({ erro: 'Falha ao carregar conversas.' }); }
  }

  async listarMensagens(req, res) {
    try {
      const conversa = await db.query('SELECT * FROM whatsapp_conversas WHERE id=$1 AND empresa_id=$2', [req.params.id, req.usuarioLogado.empresa_id]);
      if (!conversa.rows[0]) return res.status(404).json({ erro: 'Conversa não encontrada.' });
      if (conversa.rows[0].fila_status === 'ATENDENDO' && conversa.rows[0].atendente_id !== req.usuarioLogado.usuario_id) return res.status(403).json({ erro: 'Esta conversa está com outro atendente.' });
      const mensagens = await db.query('SELECT * FROM whatsapp_mensagens WHERE conversa_id=$1 ORDER BY ocorrida_em DESC,id DESC LIMIT 500', [req.params.id]);
      await db.query('UPDATE whatsapp_conversas SET nao_lidas=0 WHERE id=$1 AND empresa_id=$2 AND nao_lidas<>0', [req.params.id,req.usuarioLogado.empresa_id]);
      return res.json({ conversa: conversa.rows[0], mensagens: mensagens.rows.reverse() });
    } catch (error) { return res.status(500).json({ erro: 'Falha ao carregar mensagens.' }); }
  }

  async enviarMensagem(req, res) {
    const texto = String(req.body.texto || '').trim();
    if (!texto || texto.length > 4000) return res.status(400).json({erro:'Digite uma mensagem de ate 4000 caracteres.'});
    try {
      const mensagem=await db.transaction(async client=>{
        const c=(await client.query('SELECT * FROM whatsapp_conversas WHERE id=$1 AND empresa_id=$2 AND encerrado_em IS NULL FOR UPDATE',[req.params.id,req.usuarioLogado.empresa_id])).rows[0];
        if(!c)throw Object.assign(new Error('Conversa nao encontrada.'),{status:404});
        if(c.fila_status!=='ATENDENDO'||c.atendente_id!==req.usuarioLogado.usuario_id)throw Object.assign(new Error('Assuma o atendimento antes de responder.'),{status:409});
        if(!c.janela_atendimento_ate||new Date(c.janela_atendimento_ate)<=new Date())throw Object.assign(new Error('A janela de 24 horas terminou. Aguarde uma nova mensagem do cliente.'),{status:409});
        const nome=await nomeDoAtendente(req.usuarioLogado,client), identificado=`*${nome.slice(0,80)}:* ${texto}`;
        const enviada=await enviarERegistrar(c.id,c.telefone,identificado,req.usuarioLogado.usuario_id,req.usuarioLogado.empresa_id,client);
        await client.query('UPDATE whatsapp_conversas SET ultima_mensagem=$1,ultima_mensagem_em=NOW(),updated_at=NOW() WHERE id=$2 AND empresa_id=$3',[identificado,c.id,req.usuarioLogado.empresa_id]);return enviada;
      });return res.status(201).json(mensagem);
    }catch(error){return res.status(error.status||502).json({erro:error.status?error.message:'Nao foi possivel confirmar o envio. Confira o historico antes de tentar novamente.'});}
  }
  async alterarFila(req,res){
    const status=String(req.body.status||'').toUpperCase();
    if(!['ESPERA','AUTOMACAO'].includes(status))return res.status(400).json({erro:'Fila invalida.'});
    try{
      const result=await db.transaction(async client=>{
        const c=(await client.query('SELECT * FROM whatsapp_conversas WHERE id=$1 AND empresa_id=$2 AND encerrado_em IS NULL FOR UPDATE',[req.params.id,req.usuarioLogado.empresa_id])).rows[0];
        if(!c)throw Object.assign(new Error('Conversa nao encontrada.'),{status:404});
        if(c.atendente_id&&c.atendente_id!==req.usuarioLogado.usuario_id)throw Object.assign(new Error('Esta conversa esta com outro atendente.'),{status:409});
        if(status==='AUTOMACAO'&&!(await Automacao.configuracao(req.usuarioLogado.empresa_id,client)).ativo)throw Object.assign(new Error('Ative a automacao nas configuracoes primeiro.'),{status:409});
        return (await client.query(`UPDATE whatsapp_conversas SET fila_status=$1,bot_ativo=$2,atendente_id=NULL,bot_versao=bot_versao+1,
          bot_etapa=CASE WHEN $2 THEN 'INICIO' ELSE bot_etapa END,triagem=CASE WHEN $2 THEN '{}'::jsonb ELSE triagem END,bot_tentativas=0,updated_at=NOW() WHERE id=$3 AND empresa_id=$4 RETURNING *`,[status,status==='AUTOMACAO',c.id,req.usuarioLogado.empresa_id])).rows[0];
      });return res.json(result);
    }catch(error){return res.status(error.status||500).json({erro:error.status?error.message:'Falha ao mover conversa.'});}
  }
  async assumir(req,res){
    try{
      const result=await db.transaction(async client=>{
        const c=(await client.query('SELECT * FROM whatsapp_conversas WHERE id=$1 AND empresa_id=$2 AND encerrado_em IS NULL FOR UPDATE',[req.params.id,req.usuarioLogado.empresa_id])).rows[0];
        if(!c)throw Object.assign(new Error('Conversa nao encontrada.'),{status:404});
        if(c.atendente_id&&c.atendente_id!==req.usuarioLogado.usuario_id)throw Object.assign(new Error('Esta conversa ja foi assumida por outro atendente.'),{status:409});
        const atual=c.atendente_id===req.usuarioLogado.usuario_id&&c.fila_status==='ATENDENDO'?c:(await client.query(`UPDATE whatsapp_conversas SET fila_status='ATENDENDO',atendente_id=$1,bot_ativo=FALSE,bot_versao=bot_versao+1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3 RETURNING *`,[req.usuarioLogado.usuario_id,req.params.id,req.usuarioLogado.empresa_id])).rows[0];
        return {...atual,atendente_nome:await nomeDoAtendente(req.usuarioLogado,client)};
      });return res.json(result);
    }catch(error){return res.status(error.status||500).json({erro:error.status?error.message:'Falha ao assumir atendimento.'});}
  }
  async encerrar(req,res){
    try{
      await db.transaction(async client=>{
        const c=(await client.query('SELECT * FROM whatsapp_conversas WHERE id=$1 AND empresa_id=$2 AND encerrado_em IS NULL FOR UPDATE',[req.params.id,req.usuarioLogado.empresa_id])).rows[0];
        if(!c||c.fila_status!=='ATENDENDO'||c.atendente_id!==req.usuarioLogado.usuario_id)throw Object.assign(new Error('Somente o atendente responsavel pode encerrar esta conversa.'),{status:409});
        await client.query('UPDATE whatsapp_conversas SET encerrado_em=NOW(),atendente_id=NULL,bot_ativo=FALSE,bot_versao=bot_versao+1,updated_at=NOW() WHERE id=$1 AND empresa_id=$2',[req.params.id,req.usuarioLogado.empresa_id]);
      });return res.json({mensagem:'Atendimento encerrado.'});
    }catch(error){return res.status(error.status||500).json({erro:error.status?error.message:'Falha ao encerrar atendimento.'});}
  }
}
module.exports = new WhatsAppController();
