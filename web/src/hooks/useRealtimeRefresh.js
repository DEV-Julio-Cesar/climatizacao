import {useEffect,useRef} from 'react';
import {tempoRealAtivo} from '../services/eventos';
export function useRealtimeRefresh(tipo,callback){
  const atual=useRef(callback);atual.current=callback;
  useEffect(()=>{
    let timer=null,debounce=null;
    const atualizar=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{Promise.resolve(atual.current()).catch(()=>{});},200);};
    const evento=e=>{if(e.detail?.tipo===tipo||e.detail?.tipo==='todos')atualizar();};
    const estado=()=>{clearInterval(timer);timer=null;if(!tempoRealAtivo())timer=setInterval(atualizar,30000);};
    estado();window.addEventListener('climasaas:atualizado',evento);window.addEventListener('climasaas:tempo-real',estado);
    return()=>{clearInterval(timer);clearTimeout(debounce);window.removeEventListener('climasaas:atualizado',evento);window.removeEventListener('climasaas:tempo-real',estado);};
  },[tipo]);
}
