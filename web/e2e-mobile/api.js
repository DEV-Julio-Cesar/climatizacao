// Adapter usado só neste harness. O cliente nativo real, SecureStore e refresh
// não são substituídos no aplicativo distribuído.
let token;
export const BASE_URL = location.origin;
export async function entrar(conta) {
  const r = await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${conta}@example.test`,senha:'SenhaTeste123',cliente:'mobile'})});
  const data = await r.json();if(!r.ok)throw new Error(data.erro);token=data.token;
}
export const api = { async chamadaAutenticada(endpoint,metodo='GET',body,_tentativa=0,chave) {
  const r=await fetch(endpoint,{method:metodo,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(chave?{'Idempotency-Key':chave}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.erro),{status:r.status});return data;
} };
