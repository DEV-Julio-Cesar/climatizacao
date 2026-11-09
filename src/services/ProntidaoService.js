const { interpretarBanco } = require('../config/databaseUrl');
const SEGREDOS = ['JWT_SECRET', 'DATA_ENCRYPTION_SECRET', 'FILE_URL_SECRET', 'EMAIL_QUEUE_SECRET'];
function avaliarAmbiente(env) {
  const checks=[];
  const add=(id,ok,mensagem,nivel='erro')=>checks.push({id,status:ok?'ok':nivel,mensagem});
  for(const name of SEGREDOS){
    const v=env[name]||'';
    add(name,Buffer.byteLength(v)>=32&&!/^(troque|change|seu_|your_|example|placeholder)/i.test(v),`${name}: obrigatório, sem placeholder, com pelo menos 32 bytes.`);
  }
  add('segredos_distintos',new Set(SEGREDOS.map(n=>env[n]||'')).size===SEGREDOS.length,'Os quatro segredos devem ser independentes.');
  const banco=interpretarBanco(env.DATABASE_URL);
  add('database_url',banco.valido,'DATABASE_URL deve identificar um banco PostgreSQL.');
  add('database_tls',env.DB_SSL_REJECT_UNAUTHORIZED!=='false' && !['disable','allow','prefer','no-verify'].includes(banco.sslmode),'Validação de certificado TLS não deve estar desativada.');
  add('database_remoto',!banco.local,'Banco local exige avaliação da rede e TLS no ambiente publicado.','aviso');
  const httpsUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search;}catch{return false;}};
  add('app_url',httpsUrl(env.APP_URL),'APP_URL deve ser uma URL HTTPS pública sem credenciais, query ou fragmento.');
  if(env.PASSWORD_RESET_URL)add('password_reset_url',httpsUrl(env.PASSWORD_RESET_URL),'PASSWORD_RESET_URL deve usar HTTPS.');
  const origins=String(env.CORS_ORIGIN||'').split(',').map(s=>s.trim()).filter(Boolean);
  add('cors',origins.length>0&&origins.every(v=>{if(!httpsUrl(v))return false;return new URL(v).origin===v;}),'CORS_ORIGIN deve conter origens HTTPS explícitas, sem caminhos ou curinga.');
  const whatsapp=['WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN'];
  if(whatsapp.some(k=>env[k])){
    add('whatsapp',whatsapp.every(k=>Boolean(env[k]))&&/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||''),'WhatsApp exige número Meta, token, segredo do app e token de verificação.');
    checks.push({id:'whatsapp_vinculo',status:'pendente',mensagem:'Confirme no banco o vínculo do número receptor com a empresa; nenhum vínculo será criado.'});
  }else add('whatsapp',false,'WhatsApp não configurado; webhook e envio permanecerão indisponíveis.','aviso');
  const smtp=['SMTP_HOST','SMTP_USER','SMTP_PASS'];
  add('smtp',smtp.every(k=>Boolean(env[k])),'SMTP precisa estar configurado para recuperação de senha.','aviso');
  if(env.OBJECT_STORAGE_BUCKET){
    if(env.OBJECT_STORAGE_ENDPOINT)add('object_storage_https',httpsUrl(env.OBJECT_STORAGE_ENDPOINT),'Endpoint externo de armazenamento deve usar HTTPS.');
    add('object_storage_credentials',Boolean(env.OBJECT_STORAGE_ACCESS_KEY_ID)===Boolean(env.OBJECT_STORAGE_SECRET_ACCESS_KEY),'Informe as duas credenciais do armazenamento ou use uma identidade de serviço.');
  }
  if(env.DATA_ENCRYPTION_LEGACY_SECRET)checks.push({id:'chave_legada',status:'aviso',mensagem:'Chave legada configurada. Confirme rotação e recuperação antes de removê-la.'});
  return checks;
}
async function avaliarBanco(client,patches,phoneNumberId){
  const checks=[];
  await client.query('BEGIN READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='5000ms'");
    const exists=await client.query("SELECT to_regclass('schema_migrations') AS tabela");
    if(!exists.rows[0]?.tabela)return [{id:'migracoes',status:'erro',mensagem:'Histórico de migrações ausente. Nenhuma migração foi executada.'}];
    const aplicadas=new Set((await client.query('SELECT nome FROM schema_migrations')).rows.map(r=>r.nome));
    const pendentes=patches.filter(p=>!aplicadas.has(p));
    checks.push({id:'migracoes',status:pendentes.length?'erro':'ok',mensagem:`Migrações locais pendentes: ${pendentes.length}.`,pendentes});
    const duplicatas=await client.query("SELECT COUNT(*)::int total FROM (SELECT 1 FROM empresas WHERE cnpj IS NOT NULL AND cnpj<>'' GROUP BY regexp_replace(upper(cnpj),'[^A-Z0-9]','','g') HAVING COUNT(*)>1) d");
    checks.push({id:'cnpj_duplicado',status:duplicatas.rows[0].total?'erro':'ok',mensagem:`Grupos de empresas com CNPJ duplicado: ${duplicatas.rows[0].total}. Nenhum cadastro foi alterado.`});
    const grant=await client.query("SELECT COUNT(*)::int total FROM usuario_permissoes WHERE permissao='*'");
    checks.push({id:'curingas',status:grant.rows[0].total?'erro':'ok',mensagem:`Overrides com curinga: ${grant.rows[0].total}.`});
    const canais=await client.query("SELECT to_regclass('whatsapp_numeros') AS tabela");
    if(canais.rows[0]?.tabela){
      const r=await client.query('SELECT COUNT(*)::int total FROM whatsapp_numeros');
      checks.push({id:'whatsapp_canais',status:r.rows[0].total?'ok':'aviso',mensagem:`Números vinculados: ${r.rows[0].total}.`});
      const ambiguous=await client.query('SELECT COUNT(*)::int total FROM (SELECT empresa_id FROM whatsapp_numeros GROUP BY empresa_id HAVING COUNT(*)>1) a');
      checks.push({id:'whatsapp_ambiguo',status:ambiguous.rows[0].total?'erro':'ok',mensagem:`Empresas com múltiplos números de saída: ${ambiguous.rows[0].total}.`});
    }
    if(phoneNumberId){
      if(!canais.rows[0]?.tabela)checks.push({id:'whatsapp_vinculo',status:'erro',mensagem:'Tabela de numeros WhatsApp ausente.'});
      else {
        const r=await client.query('SELECT n.phone_number_id FROM whatsapp_numeros n JOIN empresas e ON e.id=n.empresa_id WHERE n.phone_number_id=$1 AND e.ativo=TRUE AND e.deleted_at IS NULL',[phoneNumberId]);
        checks.push({id:'whatsapp_vinculo',status:r.rows.length===1?'ok':'erro',mensagem:'O numero configurado deve estar vinculado a uma empresa ativa.'});
      }
    }
    return checks;
  } finally { await client.query('ROLLBACK'); }
}
module.exports={avaliarAmbiente,avaliarBanco};
