const fs=require('fs');
const path=require('path');
const dotenv=require('dotenv');
const {avaliarAmbiente,avaliarBanco}=require('../src/services/ProntidaoService');
async function main(){
  const args=process.argv.slice(2);
  if(args.some(a=>!['--json','--banco'].includes(a)))throw new Error('Argumento inválido. Use --json ou --banco.');
  const envPath=path.resolve(__dirname,'..','.env');
  const local=fs.existsSync(envPath)?dotenv.parse(fs.readFileSync(envPath)):{};
  const env={...local,...process.env};
  const checks=avaliarAmbiente(env);
  if(args.includes('--banco')){
    const {interpretarBanco,opcoesConexao}=require('../src/config/databaseUrl');
    const banco=interpretarBanco(env.DATABASE_URL);
    if(!banco.valido)checks.push({id:'banco',status:'erro',mensagem:'Consulta não executada: DATABASE_URL inválida.'});
    else {
      const {Client}=require('pg');
      const client=new Client({...opcoesConexao(env.DATABASE_URL,true),connectionTimeoutMillis:5000,application_name:'climasaas-preflight-readonly'});
      try{await client.connect();const patches=fs.readdirSync(path.join(__dirname,'../src/database/patches')).filter(n=>n.endsWith('.sql')).sort();checks.push(...await avaliarBanco(client,patches,env.WHATSAPP_PHONE_NUMBER_ID));}
      catch{checks.push({id:'banco',status:'erro',mensagem:'Não foi possível concluir a verificação somente leitura. Confira conexão, permissões, certificado e schema.'});}
      finally{await client.end().catch(()=>{});}
    }
  }else checks.push({id:'banco',status:'pendente',mensagem:'Banco não consultado. Use --banco para uma verificação explicitamente somente leitura.'});
  const unicos=[...new Map(checks.map(c=>[c.id,c])).values()];
  const report={modo:'somente_leitura',alvo:'prontidao_producao',aprovado:!unicos.some(c=>['erro','pendente'].includes(c.status)),checks:unicos};
  if(args.includes('--json'))process.stdout.write(JSON.stringify(report,null,2)+'\n');
  else{for(const c of checks)process.stdout.write(`[${c.status.toUpperCase()}] ${c.mensagem}\n`);process.stdout.write('Nenhum segredo foi exibido; nenhuma configuração ou migração foi alterada.\n');}
  if(!report.aprovado)process.exitCode=unicos.some(c=>c.status==='erro')?1:2;
}
if(require.main===module)main().catch(()=>{console.error('Falha no diagnóstico. Nenhuma credencial foi exibida.');process.exitCode=1;});
module.exports={main};
