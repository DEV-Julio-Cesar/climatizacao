const fs=require('fs');
const path=require('path');
const dotenv=require('dotenv');
const {identificarProvedor}=require('../src/services/ProvedorBancoService');
const {opcoesConexao}=require('../src/config/databaseUrl');
async function main(){
  const args=process.argv.slice(2);
  if(args.some(a=>a!=='--conectar'&&!a.startsWith('--env-file=')))throw new Error('Use --conectar ou --env-file=/caminho/.env.');
  const file=path.resolve(args.find(a=>a.startsWith('--env-file='))?.slice('--env-file='.length)||path.join(__dirname,'../.env'));
  const env={...(fs.existsSync(file)?dotenv.parse(fs.readFileSync(file)):{}),...process.env};
  const result={escopo:'ambiente desta execucao; nao inspeciona outro servidor',origem:process.env.DATABASE_URL?'variavel de ambiente':'arquivo de ambiente',...identificarProvedor(env.DATABASE_URL),conectividade:'nao_testada'};
  if(args.includes('--conectar')&&result.provedor!=='nao_identificado'){
    const {Client}=require('pg');
    const client=new Client({...opcoesConexao(env.DATABASE_URL),connectionTimeoutMillis:5000,query_timeout:5000,application_name:'climasaas-provedor-readonly'});
    try{await client.connect();await client.query('BEGIN READ ONLY');await client.query('SELECT 1');await client.query('ROLLBACK');result.conectividade='confirmada';}
    catch{result.conectividade='inconclusiva';process.exitCode=1;}
    finally{await client.end().catch(()=>{});}
  }
  if(result.provedor==='nao_identificado')process.exitCode=1;
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(require.main===module)main().catch(()=>{console.error('Nao foi possivel verificar o banco. Nenhuma credencial foi exibida.');process.exitCode=1;});
module.exports={main};
