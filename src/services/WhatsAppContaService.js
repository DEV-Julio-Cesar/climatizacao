const db = require('../config/database');
const WhatsApp = require('./WhatsAppService');
async function identificar(phoneNumberId, telefone) {
  if (!phoneNumberId) return null;
  const conta=(await db.query('SELECT w.empresa_id FROM empresas_whatsapp w JOIN empresas e ON e.id=w.empresa_id WHERE w.phone_number_id=$1 AND w.ativo=TRUE AND e.ativo=TRUE AND e.deleted_at IS NULL',[String(phoneNumberId)])).rows[0];
  const empresaId=conta?.empresa_id || (String(phoneNumberId)===process.env.WHATSAPP_PHONE_NUMBER_ID ? Number(process.env.WHATSAPP_EMPRESA_ID) : null);
  if(!Number.isInteger(empresaId)||empresaId<=0)return null;
  if(!conta && !(await db.query('SELECT id FROM empresas WHERE id=$1 AND ativo=TRUE AND deleted_at IS NULL',[empresaId])).rows.length)return null;
  const cliente=telefone ? (await db.query(`SELECT id AS cliente_id,nome FROM clientes WHERE empresa_id=$1 AND deleted_at IS NULL
    AND RIGHT(regexp_replace(COALESCE(telefone,''),'[^0-9]','','g'),11)=RIGHT($2,11) ORDER BY id LIMIT 1`,[empresaId,telefone])).rows[0] : null;
  return { empresa_id:empresaId,...cliente };
}
async function paraEmpresa(empresaId, obrigatorio=true) {
  if(Number(process.env.WHATSAPP_EMPRESA_ID)===Number(empresaId))return !obrigatorio&&!WhatsApp.configurado()?null:WhatsApp;
  const conta=(await db.query('SELECT phone_number_id,token_env FROM empresas_whatsapp WHERE empresa_id=$1 AND ativo=TRUE',[empresaId])).rows[0];
  if(conta) {
    const token=/^WHATSAPP_ACCESS_TOKEN_[A-Z0-9_]+$/.test(conta.token_env) ? process.env[conta.token_env] : null;
    if(!token)throw new Error('Credencial WhatsApp da empresa não configurada.');
    return WhatsApp.criarCliente({phoneNumberId:conta.phone_number_id,token});
  }
  if(!obrigatorio)return null;
  throw new Error('Número WhatsApp não configurado para esta empresa.');
}
module.exports={identificar,paraEmpresa};
