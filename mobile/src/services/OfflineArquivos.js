import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { cifrarTexto, decifrarTexto } from './OfflineCrypto';

const EXTENSAO = '.climaenc';
const pasta = () => `${FileSystem.documentDirectory}climasaas-cofre/`;
const temporarios = () => `${FileSystem.cacheDirectory}climasaas-upload/`;
const contexto = uri => `arquivo:${uri.slice(uri.lastIndexOf('/') + 1)}`;
export function arquivoProtegido(uri) { return typeof uri === 'string' && uri.startsWith(pasta()) && uri.endsWith(EXTENSAO); }

function privado(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return false;
  try {
    const url = new URL(uri), caminho = decodeURIComponent(url.pathname);
    if (caminho.endsWith('/') || caminho.includes('\\') || caminho.split('/').some(parte => parte === '.' || parte === '..')) return false;
    return [FileSystem.documentDirectory, FileSystem.cacheDirectory].filter(Boolean)
      .some(base => url.host === new URL(base).host && caminho.startsWith(decodeURIComponent(new URL(base).pathname)));
  } catch { return false; }
}

export async function guardarBase64(base64) {
  const uri = `${pasta()}${Crypto.randomUUID()}${EXTENSAO}`;
  await FileSystem.makeDirectoryAsync(pasta(), { intermediates: true });
  try {
    await FileSystem.writeAsStringAsync(uri, await cifrarTexto(base64, contexto(uri)));
    // Confere leitura/autenticação antes de substituir qualquer evidência antiga.
    if (await lerBase64Protegido(uri) !== base64) throw new Error('Falha ao verificar evidência protegida.');
    return uri;
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function guardarFoto(uri) {
  if (!privado(uri)) throw new Error('Arquivo fora do armazenamento privado do aplicativo.');
  if (arquivoProtegido(uri)) { await lerBase64Protegido(uri); return uri; }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return guardarBase64(base64);
}

async function lerBase64Protegido(uri) {
  if (!arquivoProtegido(uri)) throw new Error('Evidência protegida inválida.');
  return decifrarTexto(await FileSystem.readAsStringAsync(uri), contexto(uri));
}

export async function removerArquivoPrivado(uri) {
  if (!privado(uri)) throw new Error('Não é permitido remover arquivo fora do aplicativo.');
  return FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function comFotoParaUpload(uri, enviar, mime = 'image/jpeg') {
  if (!privado(uri)) throw new Error('Arquivo fora do armazenamento privado do aplicativo.');
  if (!arquivoProtegido(uri)) return enviar(uri); // compatibilidade com registros anteriores à migração
  await FileSystem.makeDirectoryAsync(temporarios(), { intermediates: true });
  const destino = `${temporarios()}${Crypto.randomUUID()}${mime === 'image/png' ? '.png' : '.jpg'}`;
  try {
    const base64 = await lerBase64Protegido(uri);
    await FileSystem.writeAsStringAsync(destino, base64, { encoding: FileSystem.EncodingType.Base64 });
    return await enviar(destino);
  } finally { await FileSystem.deleteAsync(destino, { idempotent: true }); }
}

export async function limparTemporariosUpload() {
  // Diretório fixo e exclusivo do app; nunca remover documentDirectory/cacheDirectory inteiros.
  await FileSystem.deleteAsync(temporarios(), { idempotent: true });
}

export async function protegerFotoExistente(uri) {
  if (!privado(uri)) throw new Error('Referência de evidência fora do armazenamento privado.');
  const info = await FileSystem.getInfoAsync(uri);
  // Não apagar a operação quando a imagem já estava ausente; o erro pode ser
  // tratado pela central de sincronização sem perder os demais registros.
  return info.exists ? guardarFoto(uri) : uri;
}
