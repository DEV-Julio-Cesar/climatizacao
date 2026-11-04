const {Client}=require('pg');
const logger=require('../config/logger');
function criarHub(ClientClass=Client){
  let pronto=false,rodando=false,cliente=null,retry=null,tentativas=0;
  const assinantes=new Set();
  function distribuir(evento){
    if(!Number.isInteger(evento?.empresa_id)||!['agenda','whatsapp'].includes(evento.tipo))return;
    for(const item of assinantes)if(item.empresaId===evento.empresa_id&&item.tipos.has(evento.tipo))try{item.enviar(evento.tipo);}catch{item.fechar();}
  }
  async function conectar(){
    if(!rodando)return;
    const connectionString=process.env.REALTIME_DATABASE_URL||process.env.DATABASE_URL;
    const local=!connectionString||/localhost|127\.0\.0\.1/.test(connectionString);
    const atual=new ClientClass({connectionString,ssl:local?false:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false'},keepAlive:true,connectionTimeoutMillis:5000});
    cliente=atual;
    const falhar=()=>{
      if(cliente!==atual)return;
      cliente=null;pronto=false;void atual.end().catch(()=>{});
      for(const item of [...assinantes])item.fechar();
      if(rodando&&!retry){retry=setTimeout(()=>{retry=null;void conectar();},Math.min(30000,1000*2**Math.min(tentativas++,5)));retry.unref();}
    };
    atual.on('error',falhar);atual.on('end',falhar);
    atual.on('notification',msg=>{if(msg.channel==='climasaas_eventos')try{distribuir(JSON.parse(msg.payload));}catch{/* ignora evento inválido */}});
    try{await atual.connect();await atual.query('LISTEN climasaas_eventos');if(cliente!==atual||!rodando){void atual.end().catch(()=>{});return;}pronto=true;tentativas=0;}
    catch{logger.aviso('eventos.conexao_indisponivel');falhar();}
  }
  function iniciar(){if(rodando)return parar;rodando=true;void conectar();return parar;}
  function parar(){rodando=false;pronto=false;clearTimeout(retry);retry=null;const anterior=cliente;cliente=null;if(anterior)void anterior.end().catch(()=>{});for(const item of [...assinantes])item.fechar();}
  function stream(req,res){
    if(!pronto)return res.status(503).json({erro:'Tempo real indisponível. A atualização periódica será mantida.'});
    const u=req.usuarioLogado,permissoes=new Set(u.permissoes||[]),tipos=new Set();
    if(permissoes.has('*')||permissoes.has('AGENDA_VISUALIZAR')||permissoes.has('GESTAO_VISUALIZAR'))tipos.add('agenda');
    if(permissoes.has('*')||permissoes.has('ATENDIMENTO_VISUALIZAR'))tipos.add('whatsapp');
    if(!tipos.size)return res.status(403).json({erro:'Sem permissão para eventos.'});
    if([...assinantes].filter(a=>a.empresaId===u.empresa_id&&a.usuarioId===u.usuario_id).length>=5)return res.status(429).json({erro:'Limite de conexões simultâneas atingido.'});
    res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
    const enviar=tipo=>{if(res.writableEnded)return;if(res.writableLength>65536){fechar();return;}res.write(`event: atualizar\ndata: ${JSON.stringify({tipo})}\n\n`);res.flush?.();};
    let encerrado=false;
    const item={empresaId:u.empresa_id,usuarioId:u.usuario_id,tipos,enviar,fechar:()=>fechar()};
    function fechar(){if(encerrado)return;encerrado=true;clearInterval(heartbeat);clearTimeout(limite);assinantes.delete(item);if(!res.writableEnded&&!res.destroyed)res.end();}
    const heartbeat=setInterval(()=>{if(!res.writableEnded&&!res.destroyed){res.write(': heartbeat\n\n');res.flush?.();}},15000);heartbeat.unref();
    const limite=setTimeout(fechar,Math.max(1,Math.min(60000,(u.exp||Infinity)*1000-Date.now())));limite.unref();
    assinantes.add(item);res.on('close',fechar);res.on('error',fechar);enviar('todos');
  }
  return {iniciar,parar,stream,distribuir,get total(){return assinantes.size;}};
}
module.exports=criarHub();
module.exports.criarHub=criarHub;
