import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

const localHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${localHost}:3000`;

// Tempo limite padrão para requisições (ms)
const REQUEST_TIMEOUT_MS = 15_000;

// Callback chamado quando a sessão expira definitivamente (nenhum refresh salvou)
let aoExpirarSessao = null;
export const configurarSessaoExpirada = (handler) => { aoExpirarSessao = handler; };

// Evita múltiplos refreshes simultâneos — reutiliza a mesma Promise em andamento
let _refreshPromise = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getToken() {
  const value = await SecureStore.getItemAsync('climasaas_token');
  if (!value) throw Object.assign(new Error('Usuário não autenticado.'), { status: 401 });
  return value;
}

async function getRefreshToken() {
  return SecureStore.getItemAsync('climasaas_refresh_token');
}

/**
 * Tenta renovar o access-token usando o refresh-token armazenado.
 * Se bem-sucedido, persiste o novo par de tokens no SecureStore.
 * Retorna o novo access-token, ou lança erro se o refresh falhar.
 */
async function renovarSessao() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) throw Object.assign(new Error('Sessão expirada.'), { status: 401 });

    const response = await fetchComTimeout(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) throw Object.assign(new Error('Sessão expirada.'), { status: 401 });

    const dados = await response.json();
    await SecureStore.setItemAsync('climasaas_token', dados.token);
    if (dados.refresh_token) {
      await SecureStore.setItemAsync('climasaas_refresh_token', dados.refresh_token);
    }
    return dados.token;
  })().finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

/**
 * Faz fetch com timeout explícito usando AbortController.
 */
function fetchComTimeout(url, opcoes = {}, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opcoes, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

/**
 * Interpreta a resposta e lança um erro tipado se não for 2xx.
 */
async function parse(response) {
  let data = {};
  const text = await response.text();
  try { data = text ? JSON.parse(text) : {}; } catch { /* resposta não-JSON */ }
  if (!response.ok) {
    const error = new Error(data.erro || `Erro ${response.status} na requisição.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * Normaliza erros de rede/timeout para mensagens amigáveis.
 */
function normalizarErro(error) {
  if (error.name === 'AbortError') {
    const e = new Error('A requisição demorou muito. Verifique sua conexão e tente novamente.');
    e.status = 0;
    throw e;
  }
  // TypeError de rede (sem internet, DNS etc.)
  if (error instanceof TypeError && !error.status) {
    const e = new Error('Sem conexão com o servidor. Verifique sua internet.');
    e.status = 0;
    throw e;
  }
  throw error;
}

// ─── API pública ─────────────────────────────────────────────────────────────

export const api = {
  async login(email, senha) {
    try {
      const response = await fetchComTimeout(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const dados = await parse(response);
      // Persiste o refresh token se o servidor o enviar
      if (dados.refresh_token) {
        await SecureStore.setItemAsync('climasaas_refresh_token', dados.refresh_token);
      }
      return dados;
    } catch (error) {
      normalizarErro(error);
    }
  },

  /**
   * Chamada autenticada com renovação automática de sessão (uma tentativa).
   * - Se receber 401, tenta renovar o token via refresh.
   * - Se o refresh também falhar, limpa o armazenamento e dispara onSessaoExpirada.
   */
  async chamadaAutenticada(endpoint, metodo = 'GET', body, _tentativa = 0) {
    let tokenAtual;
    try { tokenAtual = await getToken(); } catch {
      await SecureStore.deleteItemAsync('climasaas_token');
      aoExpirarSessao?.();
      throw Object.assign(new Error('Sessão expirada. Faça login novamente.'), { status: 401 });
    }

    let response;
    try {
      response = await fetchComTimeout(`${BASE_URL}${endpoint}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${tokenAtual}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      normalizarErro(error);
    }

    // Token expirado → tenta renovar uma vez
    if (response.status === 401 && _tentativa === 0) {
      try {
        await renovarSessao();
        return this.chamadaAutenticada(endpoint, metodo, body, 1);
      } catch {
        await SecureStore.deleteItemAsync('climasaas_token');
        await SecureStore.deleteItemAsync('climasaas_refresh_token');
        aoExpirarSessao?.();
        throw Object.assign(new Error('Sessão expirada. Faça login novamente.'), { status: 401 });
      }
    }

    return parse(response);
  },

  async uploadFoto(osId, tipo, arquivo, metadados = {}) {
    let tokenAtual;
    try { tokenAtual = await getToken(); } catch {
      aoExpirarSessao?.();
      throw Object.assign(new Error('Sessão expirada.'), { status: 401 });
    }

    const form = new FormData();
    form.append('os_id', String(osId));
    form.append('tipo', tipo);
    Object.entries(metadados).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '')
        form.append(chave, String(valor));
    });
    const file = new File(arquivo.uri);
    form.append('imagem', file, arquivo.name || file.name);

    let response;
    try {
      response = await expoFetch(`${BASE_URL}/os/fotos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenAtual}` },
        body: form,
      });
    } catch (error) {
      normalizarErro(error);
    }

    // Token expirado no upload → renova e tenta uma vez
    if (response.status === 401) {
      try {
        const novoToken = await renovarSessao();
        const form2 = new FormData();
        form2.append('os_id', String(osId));
        form2.append('tipo', tipo);
        Object.entries(metadados).forEach(([chave, valor]) => {
          if (valor !== undefined && valor !== null && valor !== '')
            form2.append(chave, String(valor));
        });
        form2.append('imagem', file, arquivo.name || file.name);
        response = await expoFetch(`${BASE_URL}/os/fotos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${novoToken}` },
          body: form2,
        });
      } catch {
        await SecureStore.deleteItemAsync('climasaas_token');
        await SecureStore.deleteItemAsync('climasaas_refresh_token');
        aoExpirarSessao?.();
        throw Object.assign(new Error('Sessão expirada. Faça login novamente.'), { status: 401 });
      }
    }

    return parse(response);
  },
};
