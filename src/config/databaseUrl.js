function interpretarBanco(connectionString) {
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return { valido: false, local: false };
    return { valido: Boolean(url.hostname && url.pathname.length > 1), local: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), sslmode: url.searchParams.get('sslmode') };
  } catch { return { valido: false, local: false }; }
}
function opcoesConexao(connectionString, rejectUnauthorized=true) {
  if(!connectionString)return {ssl:false};
  if(!interpretarBanco(connectionString).valido)throw new Error('DATABASE_URL invalida.');
  const parsed=require('pg-connection-string').parse(connectionString);
  delete parsed.connectionString;
  const local=interpretarBanco(connectionString).local;
  const ssl=local?false:{...(typeof parsed.ssl==='object'?parsed.ssl:{}),rejectUnauthorized};
  if(ssl)delete ssl.checkServerIdentity;
  // Do not pass connectionString again: pg would reparse it and override our TLS policy.
  return {...parsed,ssl};
}
module.exports = { interpretarBanco, opcoesConexao };
