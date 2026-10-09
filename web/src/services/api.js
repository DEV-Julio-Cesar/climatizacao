import axios from'axios';
const padrao=location.hostname==='localhost'?'http://localhost:3000':location.origin;
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||padrao});
api.interceptors.request.use(c=>{const t=localStorage.getItem('climasaas_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c});
api.interceptors.response.use(r=>r,e=>{if(e.response?.status===401){localStorage.clear();location.reload()}return Promise.reject(e)});
