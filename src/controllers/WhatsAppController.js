const crypto = require('crypto');
const db = require('../config/database');
const WhatsAppService = require('../services/WhatsAppService');

const normalizar = (valor) => String(valor || '').replace(/\D/g, '');

async function identificarEmpresa(telefone) {
  const cliente = await db.query(
    `SELECT c.id AS cliente_id,c.empresa_id,c.nome FROM clientes c JOIN empresas e ON e.id=c.empresa_id
     WHERE c.deleted_at IS NULL AND e.ativo=TRUE
       AND RIGHT(regexp_replace(COALESCE(c.telefone,''),'\D','','g'),11)=RIGHT($1,11)
     ORDER BY c.id LIMIT 1`, [telefone]
  );
  if (cliente.rows[0]) return cliente.rows[0];
  if (process.env.WHATSAPP_EMPRESA_ID) return { empresa_id: Number(process.env.WHATSAPP_EMPRESA_ID) };
  const unica = await db.query('SELECT id AS empresa_id FROM empresas WHERE ativo=TRUE AND deleted_at IS NULL ORDER BY id LIMIT 2');
  return unica.rows.length === 1 ? unica.rows[0] : null;
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
    const segredo = process.env.WHATSAPP_APP_SECRET;
    const assinatura = req.get('x-hub-signature-256');
    if (segredo && req.rawBody) {
      const esperada = `sha256=${crypto.createHmac('sha256', segredo).update(req.rawBody).digest('hex')}`;
      if (!assinatura || assinatura.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return res.sendStatus(401);
    }
    res.sendStatus(200);
    try {
      for (const entrada of req.body.entry || []) for (const alteracao of entrada.changes || []) {
        const valor = alteracao.value || {};
        for (const status of valor.statuses || []) await db.query(
          'UPDATE whatsapp_mensagens SET status=$1 WHERE whatsapp_id=$2', [status.status || 'enviada', status.id]
        );
        for (const mensagem of valor.messages || []) {
          const telefone = normalizar(mensagem.from); if (!telefone) continue;
          const vinculo = await identificarEmpresa(telefone); if (!vinculo?.empresa_id) continue;
          const contato = (valor.contacts || []).find((item) => normalizar(item.wa_id) === telefone);
          const conteudo = mensagem.text?.body || mensagem.button?.text || mensagem.interactive?.button_reply?.title || mensagem.interactive?.list_reply?.title || `[${mensagem.type || 'mensagem'}]`;
          const data = mensagem.timestamp ? new Date(Number(mensagem.timestamp) * 1000) : new Date();
          const conversa = await db.query(
            `INSERT INTO whatsapp_conversas(empresa_id,cliente_id,telefone,nome_contato,ultima_mensagem,ultima_mensagem_em,nao_lidas,janela_atendimento_ate)
             VALUES($1,$2,$3,$4,$5,$6,1,$6::timestamptz+INTERVAL '24 hours')
             ON CONFLICT(empresa_id,telefone) DO UPDATE SET cliente_id=COALESCE(EXCLUDED.cliente_id,whatsapp_conversas.cliente_id),nome_contato=COALESCE(EXCLUDED.nome_contato,whatsapp_conversas.nome_contato),ultima_mensagem=EXCLUDED.ultima_mensagem,ultima_mensagem_em=EXCLUDED.ultima_mensagem_em,nao_lidas=whatsapp_conversas.nao_lidas+1,janela_atendimento_ate=EXCLUDED.janela_atendimento_ate,updated_at=NOW() RETURNING id`,
            [vinculo.empresa_id, vinculo.cliente_id || null, telefone, contato?.profile?.name || vinculo.nome || null, conteudo, data]
          );
          await db.query(
            `INSERT INTO whatsapp_mensagens(conversa_id,whatsapp_id,direcao,tipo,conteudo,status,ocorrida_em)
             VALUES($1,$2,'ENTRADA',$3,$4,'recebida',$5) ON CONFLICT(whatsapp_id) DO NOTHING`,
            [conversa.rows[0].id, mensagem.id, mensagem.type || 'text', conteudo, data]
          );
        }
      }
    } catch (error) { console.error('Falha ao processar webhook WhatsApp:', error.message); }
  }

  async listarConversas(req, res) {
    try {
      const result = await db.query(
        `SELECT w.*,c.nome AS cliente_nome FROM whatsapp_conversas w LEFT JOIN clientes c ON c.id=w.cliente_id
         WHERE w.empresa_id=$1 ORDER BY w.ultima_mensagem_em DESC NULLS LAST,w.updated_at DESC LIMIT 300`,
        [req.usuarioLogado.empresa_id]
      );
      return res.json(result.rows);
    } catch (error) { return res.status(500).json({ erro: 'Falha ao carregar conversas.' }); }
  }

  async listarMensagens(req, res) {
    try {
      const conversa = await db.query('SELECT * FROM whatsapp_conversas WHERE id=$1 AND empresa_id=$2', [req.params.id, req.usuarioLogado.empresa_id]);
      if (!conversa.rows[0]) return res.status(404).json({ erro: 'Conversa não encontrada.' });
      const mensagens = await db.query('SELECT * FROM whatsapp_mensagens WHERE conversa_id=$1 ORDER BY ocorrida_em,id LIMIT 500', [req.params.id]);
      await db.query('UPDATE whatsapp_conversas SET nao_lidas=0 WHERE id=$1', [req.params.id]);
      return res.json({ conversa: conversa.rows[0], mensagens: mensagens.rows });
    } catch (error) { return res.status(500).json({ erro: 'Falha ao carregar mensagens.' }); }
  }

  async enviarMensagem(req, res) {
    const texto = String(req.body.texto || '').trim();
    if (!texto || texto.length > 4096) return res.status(400).json({ erro: 'Digite uma mensagem de até 4096 caracteres.' });
    try {
      const conversa = await db.query('SELECT * FROM whatsapp_conversas WHERE id=$1 AND empresa_id=$2', [req.params.id, req.usuarioLogado.empresa_id]);
      if (!conversa.rows[0]) return res.status(404).json({ erro: 'Conversa não encontrada.' });
      if (!conversa.rows[0].janela_atendimento_ate || new Date(conversa.rows[0].janela_atendimento_ate) < new Date()) return res.status(409).json({ erro: 'A janela de 24 horas terminou. Envie um template aprovado pela Meta para reiniciar o atendimento.' });
      const retorno = await WhatsAppService.enviarMensagem(conversa.rows[0].telefone, texto);
      const whatsappId = retorno?.messages?.[0]?.id || null;
      const mensagem = await db.query(
        `INSERT INTO whatsapp_mensagens(conversa_id,whatsapp_id,direcao,tipo,conteudo,status,enviado_por)
         VALUES($1,$2,'SAIDA','text',$3,'enviada',$4) RETURNING *`,
        [req.params.id, whatsappId, texto, req.usuarioLogado.usuario_id]
      );
      await db.query('UPDATE whatsapp_conversas SET ultima_mensagem=$1,ultima_mensagem_em=NOW(),updated_at=NOW() WHERE id=$2', [texto, req.params.id]);
      return res.status(201).json(mensagem.rows[0]);
    } catch (error) { return res.status(502).json({ erro: error.message || 'Falha ao enviar mensagem pelo WhatsApp.' }); }
  }
}
module.exports = new WhatsAppController();
