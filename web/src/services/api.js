import axios from'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'http://localhost:3000'});
api.interceptors.request.use(c=>{const t=localStorage.getItem('climasaas_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c});
api.interceptors.response.use(r=>r,e=>{if(e.response?.status===401){localStorage.clear();location.reload()}return Promise.reject(e)});
