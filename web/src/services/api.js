import axios from'axios';
const padrao=location.hostname==='localhost'?'http://localhost:3000':location.origin;
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||padrao,timeout:20000});
api.interceptors.request.use(c=>{const t=localStorage.getItem('climasaas_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c});
api.interceptors.response.use(r=>r,e=>{if(e.response?.status===401){localStorage.removeItem('climasaas_token');localStorage.removeItem('climasaas_usuario');window.dispatchEvent(new Event('climasaas:session-expired'))}return Promise.reject(e)});
