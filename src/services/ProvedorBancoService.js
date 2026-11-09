const { interpretarBanco } = require('../config/databaseUrl');
function identificarProvedor(connectionString) {
  const info=interpretarBanco(connectionString);
  if(!info.valido)return {provedor:'nao_identificado',local:false,mensagem:'DATABASE_URL ausente ou invalida.'};
  const host=new URL(connectionString).hostname.toLowerCase();
  if(host==='neon.tech'||host.endsWith('.neon.tech'))return {provedor:'Neon',local:false,mensagem:'Endpoint gerenciado pelo Neon. A regiao ou a palavra aws no hostname nao o tornam um RDS da sua conta.'};
  if(host.endsWith('.rds.amazonaws.com')||host.endsWith('.rds.amazonaws.com.cn'))return {provedor:'AWS RDS/Aurora',local:false,mensagem:'Endpoint de banco gerenciado da AWS.'};
  if(info.local)return {provedor:'PostgreSQL local ao servidor',local:true,mensagem:'O banco esta no mesmo servidor da API. Se esse servidor for a EC2, o banco fica na instancia AWS; isto nao significa RDS.'};
  return {provedor:'PostgreSQL remoto nao identificado',local:false,mensagem:'O hostname nao identifica Neon nem RDS. Verifique a infraestrutura do servidor de banco.'};
}
module.exports={identificarProvedor};
