import axios from 'axios';

const BASE_URL =
  location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : import.meta.env.VITE_API_URL || location.origin;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,
  // Necessário para enviar o refresh cookie HttpOnly quando painel e API
  // estiverem em origens diferentes autorizadas pelo backend.
  withCredentials: true,
});

// ─── Mutex de refresh ──────────────────────────────────────────────────────
// Evita múltiplos refreshes simultâneos quando várias requisições recebem
// 401 ao mesmo tempo (ex.: ao recarregar uma página com muitos widgets).
let _refreshPromise = null;
let accessToken=null;
let sessionVersion=0;
export const getAccessToken=()=>accessToken;
export const setAccessToken=value=>{accessToken=value;};
localStorage.removeItem('climasaas_token');
localStorage.removeItem('climasaas_refresh_token');

/**
 * Tenta renovar o access-token usando o refresh-token armazenado.
 * Retorna o novo access-token, ou lança erro se o refresh falhar.
 */
async function renovarSessao() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    // Usa fetch nativo para não passar pelo interceptor do axios
    // (evitaria loop infinito se o /auth/refresh também devolvesse 401)
    const version=sessionVersion;
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente: 'web' }),
    });

    if (!res.ok) throw new Error('Refresh falhou.');

    const dados = await res.json();
    if(version!==sessionVersion)throw new Error('Sessao encerrada.');
    setAccessToken(dados.token);
    if(dados.usuario)localStorage.setItem('climasaas_usuario',JSON.stringify(dados.usuario));
    return dados.token;
  })().finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

// ─── Interceptor de request ────────────────────────────────────────────────
// Injeta o token de acesso em todos os requests autenticados.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  const empresa=sessionStorage.getItem('climasaas_empresa_contexto');
  const user=JSON.parse(localStorage.getItem('climasaas_usuario')||'{}');
  if(user.perfil==='MASTER' && empresa && !config.url?.startsWith('/master/'))config.headers['X-Empresa-Id']=empresa;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Interceptor de response ───────────────────────────────────────────────
// Em 401: tenta renovar o token uma vez; se falhar, expira a sessão.
// Em outros erros: propaga normalmente.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Só trata 401 em requisições que ainda não foram retentadas
    if (error.response?.status !== 401 || !config || config._retried || ['/login','/auth/refresh','/auth/refresh/logout','/conta/logout','/conta/senha','/conta/empresa','/conta/dados'].includes(config.url)) {
      return Promise.reject(error);
    }

    // Marca para não retentar indefinidamente
    config._retried = true;

    try {
      const novoToken = await renovarSessao();
      // Atualiza o header da requisição original e reenvia
      config.headers.Authorization = `Bearer ${novoToken}`;
      return api(config);
    } catch {
      // Refresh falhou → sessão expirada definitivamente
      limparSessao();
      window.dispatchEvent(new Event('climasaas:session-expired'));
      return Promise.reject(error);
    }
  },
);

export const restaurarSessao=renovarSessao;
export function limparSessao(){sessionVersion++;accessToken=null;sessionStorage.removeItem('climasaas_empresa_contexto');for(const chave of ['climasaas_token','climasaas_refresh_token','climasaas_usuario'])localStorage.removeItem(chave);}

export async function encerrarSessao() {
  sessionVersion++;
  if(_refreshPromise)await _refreshPromise.catch(()=>{});
  try {
    await api.post('/auth/refresh/logout', {});
  } finally {
    limparSessao();
  }
}
