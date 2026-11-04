import {BASE_URL,tokenAtual,renovarSessao,limparSessao} from './api';
import {criarParser} from './sseParser';
let conectado=false;
let geracao=0;
export const tempoRealAtivo=()=>conectado;
function estado(valor){if(valor!==conectado){conectado=valor;window.dispatchEvent(new CustomEvent('climasaas:tempo-real',{detail:valor}));}}
export function conectarEventos(){
  const versao=++geracao;
  const atualizarEstado=valor=>{if(versao===geracao)estado(valor);};
  let parado=false,controller=null,pararEspera=()=>{};
  const esperar=ms=>new Promise(resolve=>{const timer=setTimeout(resolve,ms);pararEspera=()=>{clearTimeout(timer);resolve();};});
  const executar=async()=>{
    let tentativa=0;
    while(!parado){
      controller=new AbortController();
      const conexao=controller;let watchdog;
      const renovarPrazo=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>conexao.abort(),40000);};
      try{
        renovarPrazo();
        const response=await fetch(`${BASE_URL}/eventos`,{headers:{Authorization:`Bearer ${tokenAtual()}`,Accept:'text/event-stream'},credentials:'include',cache:'no-store',signal:controller.signal});
        if(parado||versao!==geracao)return;
        if(response.status===401){
          try{await renovarSessao();}catch(e){if(parado||versao!==geracao)return;if([400,401].includes(e.response?.status)){limparSessao();window.dispatchEvent(new Event('climasaas:session-expired'));return;}throw e;}
          continue;
        }
        if(response.status===403)return;
        if(!response.ok||!response.body?.getReader||!response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Conexão indisponível.');
        atualizarEstado(true);tentativa=0;
        const reader=response.body.getReader(),decoder=new TextDecoder();
        const receber=criarParser(({evento,dados})=>{if(evento!=='atualizar')return;try{const valor=JSON.parse(dados);if(['todos','agenda','whatsapp'].includes(valor.tipo))window.dispatchEvent(new CustomEvent('climasaas:atualizado',{detail:valor}));}catch{}});
        try{while(!parado){const {done,value}=await reader.read();if(done||parado||versao!==geracao)break;renovarPrazo();receber(decoder.decode(value,{stream:true}));}}
        finally{reader.releaseLock();}
      }catch{/* API REST continua disponível enquanto o stream reconecta. */}
      finally{clearTimeout(watchdog);conexao.abort();atualizarEstado(false);}
      if(!parado)await esperar(Math.min(30000,1000*2**Math.min(tentativa++,5)));
    }
  };
  void executar();
  return()=>{parado=true;controller?.abort();pararEspera();atualizarEstado(false);};
}
