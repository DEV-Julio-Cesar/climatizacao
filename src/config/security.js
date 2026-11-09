function validarConfiguracao(){
  if(process.env.NODE_ENV!=='production')return;
  const nomes=['JWT_SECRET','DATA_ENCRYPTION_SECRET','FILE_URL_SECRET','EMAIL_QUEUE_SECRET'];
  const values=nomes.map(n=>process.env[n]||'');
  if(values.some(v=>Buffer.byteLength(v)<32)||new Set(values).size!==values.length)throw new Error('Produção exige JWT_SECRET, DATA_ENCRYPTION_SECRET, FILE_URL_SECRET e EMAIL_QUEUE_SECRET distintos com ao menos 32 bytes. Consulte docs/correcoes-seguranca.md antes de migrar chaves existentes.');
  if(!require('./databaseUrl').interpretarBanco(process.env.DATABASE_URL).valido)throw new Error('Producao exige DATABASE_URL PostgreSQL explicita.');
  if(process.env.DB_SSL_REJECT_UNAUTHORIZED==='false')throw new Error('Produção exige validação do certificado PostgreSQL.');
}
module.exports={validarConfiguracao};
