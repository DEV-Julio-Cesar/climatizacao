import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

const localHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${localHost}:3000`;

async function parse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.erro || 'Erro na requisição.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function token() {
  const value = await SecureStore.getItemAsync('climasaas_token');
  if (!value) throw new Error('Usuário não autenticado.');
  return value;
}

export const api = {
  async login(email, senha) {
    return parse(await fetch(`${BASE_URL}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }),
    }));
  },
  async chamadaAutenticada(endpoint, metodo = 'GET', body) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401) await SecureStore.deleteItemAsync('climasaas_token');
    return parse(response);
  },
  async uploadFoto(osId, tipo, arquivo) {
    const form = new FormData();
    form.append('os_id', String(osId));
    form.append('tipo', tipo);
    const file = new File(arquivo.uri);
    form.append('imagem', file, arquivo.name || file.name);
    return parse(await expoFetch(`${BASE_URL}/os/fotos`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form,
    }));
  },
};
