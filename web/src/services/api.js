import axios from 'axios';

const BASE_URL =
  location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : import.meta.env.VITE_API_URL || location.origin;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,
});

// ─── Mutex de refresh ──────────────────────────────────────────────────────
// Evita múltiplos refreshes simultâneos quando várias requisições recebem
// 401 ao mesmo tempo (ex.: ao recarregar uma página com muitos widgets).
let _refreshPromise = null;

/**
 * Tenta renovar o access-token usando o refresh-token armazenado.
 * Retorna o novo access-token, ou lança erro se o refresh falhar.
 */
async function renovarSessao() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('climasaas_refresh_token');
    if (!refreshToken) throw new Error('Sem refresh token.');

    // Usa fetch nativo para não passar pelo interceptor do axios
    // (evitaria loop infinito se o /auth/refresh também devolvesse 401)
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) throw new Error('Refresh falhou.');

    const dados = await res.json();
    localStorage.setItem('climasaas_token', dados.token);
    if (dados.refresh_token) {
      localStorage.setItem('climasaas_refresh_token', dados.refresh_token);
    }
    return dados.token;
  })().finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

// ─── Interceptor de request ────────────────────────────────────────────────
// Injeta o token de acesso em todos os requests autenticados.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('climasaas_token');
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
    if (error.response?.status !== 401 || config._retried) {
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
      localStorage.removeItem('climasaas_token');
      localStorage.removeItem('climasaas_refresh_token');
      localStorage.removeItem('climasaas_usuario');
      window.dispatchEvent(new Event('climasaas:session-expired'));
      return Promise.reject(error);
    }
  },
);
