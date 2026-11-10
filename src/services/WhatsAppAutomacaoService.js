const db = require('../config/database');
const Bot = require('./WhatsAppBotService');

async function configuracao(empresaId, executor = db) {
  const result = await executor.query(`SELECT e.nome AS empresa_nome,a.ativo,a.nome_atendimento,a.boas_vindas,a.horario_informativo,a.encaminhamento
    FROM empresas e LEFT JOIN whatsapp_automacao a ON a.empresa_id=e.id WHERE e.id=$1 AND e.ativo=TRUE AND e.deleted_at IS NULL`, [empresaId]);
  const row = result.rows[0];
  if (!row) throw new Error('Empresa indisponível.');
  return { ativo: row.ativo ?? true, nome_atendimento: row.nome_atendimento || row.empresa_nome,
    boas_vindas: row.boas_vindas ?? Bot.PADRAO.boas_vindas, horario_informativo: row.horario_informativo || '', encaminhamento: row.encaminhamento ?? Bot.PADRAO.encaminhamento };
}

async function receber({ empresaId, clienteId, telefone, nomeContato, mensagem }, executor = db) {
  const texto = String(mensagem.text?.body || mensagem.button?.text || mensagem.interactive?.button_reply?.id || mensagem.interactive?.list_reply?.id || `[${mensagem.type || 'mensagem'}]`).slice(0,4096);
  let data = new Date(Number(mensagem.timestamp) * 1000);
  if (!Number.isFinite(data.getTime()) || data.getTime() > Date.now()) data = new Date();
  return executor.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`whatsapp:${empresaId}:${telefone}`]);
    // Deduplicar antes de alterar conversa, contadores ou janela de atendimento.
    const anterior = await client.query('SELECT id FROM whatsapp_mensagens WHERE whatsapp_id=$1',[mensagem.id]);
    if (anterior.rows.length) return { duplicada:true };
    const conversa = (await client.query(`INSERT INTO whatsapp_conversas(empresa_id,cliente_id,telefone,nome_contato,ultima_mensagem,ultima_mensagem_em,nao_lidas,janela_atendimento_ate)
      VALUES($1,$2,$3,$4,$5,$6,1,$6::timestamptz+INTERVAL '24 hours')
      ON CONFLICT(empresa_id,telefone) DO UPDATE SET cliente_id=COALESCE(EXCLUDED.cliente_id,whatsapp_conversas.cliente_id),
        nome_contato=COALESCE(EXCLUDED.nome_contato,whatsapp_conversas.nome_contato),
        ultima_mensagem=CASE WHEN EXCLUDED.ultima_mensagem_em>=whatsapp_conversas.ultima_mensagem_em THEN EXCLUDED.ultima_mensagem ELSE whatsapp_conversas.ultima_mensagem END,
        ultima_mensagem_em=GREATEST(EXCLUDED.ultima_mensagem_em,whatsapp_conversas.ultima_mensagem_em),nao_lidas=whatsapp_conversas.nao_lidas+1,
        janela_atendimento_ate=GREATEST(EXCLUDED.janela_atendimento_ate,whatsapp_conversas.janela_atendimento_ate),
        bot_etapa=CASE WHEN whatsapp_conversas.encerrado_em IS NOT NULL THEN 'INICIO' ELSE whatsapp_conversas.bot_etapa END,
        bot_ativo=CASE WHEN whatsapp_conversas.encerrado_em IS NOT NULL THEN TRUE ELSE whatsapp_conversas.bot_ativo END,
        fila_status=CASE WHEN whatsapp_conversas.encerrado_em IS NOT NULL THEN 'AUTOMACAO' ELSE whatsapp_conversas.fila_status END,
        atendente_id=CASE WHEN whatsapp_conversas.encerrado_em IS NOT NULL THEN NULL ELSE whatsapp_conversas.atendente_id END,
        triagem=CASE WHEN whatsapp_conversas.encerrado_em IS NOT NULL THEN '{}'::jsonb ELSE whatsapp_conversas.triagem END,
        bot_tentativas=CASE WHEN whatsapp_conversas.encerrado_em IS NOT NULL THEN 0 ELSE whatsapp_conversas.bot_tentativas END,
        bot_versao=whatsapp_conversas.bot_versao+CASE WHEN whatsapp_conversas.encerrado_em IS NOT NULL THEN 1 ELSE 0 END,
        encerrado_em=NULL,updated_at=NOW() RETURNING *`,
    [empresaId,clienteId || null,telefone,String(nomeContato || '').slice(0,150) || null,texto,data])).rows[0];
    const inserida = (await client.query(`INSERT INTO whatsapp_mensagens(conversa_id,whatsapp_id,direcao,tipo,conteudo,status,ocorrida_em)
      VALUES($1,$2,'ENTRADA',$3,$4,'recebida',$5) RETURNING id`,[conversa.id,mensagem.id,mensagem.type || 'text',texto,data])).rows[0];
    if (!conversa.bot_ativo || conversa.fila_status !== 'AUTOMACAO' || conversa.atendente_id) return { conversa_id:conversa.id };
    const config = await configuracao(empresaId, client);
    const resposta = Bot.decidir(conversa.bot_etapa,texto,null,{ config,dados:conversa.triagem,tentativas:conversa.bot_tentativas,tipo:mensagem.type });
    await client.query(`UPDATE whatsapp_conversas SET bot_etapa=$1,bot_ativo=$2,fila_status=$3,triagem=$4::jsonb,bot_tentativas=$5,updated_at=NOW() WHERE id=$6 AND empresa_id=$7`,
    [resposta.proximaEtapa,resposta.ativo,resposta.fila,JSON.stringify(resposta.dados),resposta.tentativas,conversa.id,empresaId]);
    if (resposta.texto) await client.query('INSERT INTO whatsapp_respostas_bot(empresa_id,conversa_id,mensagem_origem_id,versao,texto) VALUES($1,$2,$3,$4,$5)',[empresaId,conversa.id,inserida.id,conversa.bot_versao,resposta.texto]);
    return { conversa_id:conversa.id };
  });
}
module.exports = { configuracao, receber };
