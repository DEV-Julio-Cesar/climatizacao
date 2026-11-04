import axios from 'axios';
export const BASE_URL = import.meta.env.VITE_API_URL || (location.hostname === 'localhost' ? 'http://localhost:3000' : location.origin);
export const api = axios.create({ baseURL: BASE_URL, timeout: 20_000, withCredentials: true });
let token = null, renovacao = null, geracao = 0;
export function definirToken(valor) { token = valor; }
export function tokenAtual(){return token;}
export function limparSessao() {
  geracao += 1; token = null;
  ['climasaas_token', 'climasaas_refresh_token', 'climasaas_usuario'].forEach(chave => localStorage.removeItem(chave));
}
limparSessao();
export async function renovarSessao() {
  if (renovacao) return renovacao;
  const atual = geracao;
  renovacao = axios.post(`${BASE_URL}/auth/refresh`, { cliente: 'web' }, { withCredentials: true, timeout: 20_000 })
    .then(({ data }) => {
      if (atual !== geracao) throw new Error('Sessão encerrada.');
      token = data.token; return data;
    }).finally(() => { renovacao = null; });
  return renovacao;
}
export async function encerrarSessao() { await api.post('/auth/refresh/logout'); limparSessao(); }
api.interceptors.request.use(config => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(response => response, async error => {
  const config = error.config;
  if (!config || error.response?.status !== 401 || config._retried || ['/login', '/auth/refresh/logout'].includes(config.url)) throw error;
  config._retried = true;
  try {
    const dados = await renovarSessao(); config.headers.Authorization = `Bearer ${dados.token}`; return api(config);
  } catch (falha) {
    if ([400, 401].includes(falha.response?.status)) {
      limparSessao(); window.dispatchEvent(new Event('climasaas:session-expired'));
    }
    throw falha;
  }
});
