import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CHAVE = 'climasaas_offline_aes_v1';
const PREFIXO = 'clima-aes-gcm-v1:';
let preparando = null;
const indisponivel = () => new Error('A proteção dos dados locais não está disponível. Desbloqueie o aparelho e tente novamente. Não desinstale o aplicativo enquanto houver envios pendentes.');

async function chave() {
  const valor = await SecureStore.getItemAsync(CHAVE);
  if (!valor || !/^[a-f0-9]{64}$/i.test(valor)) throw indisponivel();
  return Crypto.AESEncryptionKey.import(valor, 'hex');
}

export async function inicializarCofre(jaConfigurado) {
  if (preparando) return preparando;
  preparando = (async () => {
    if (!await SecureStore.isAvailableAsync()) throw indisponivel();
    const existente = await SecureStore.getItemAsync(CHAVE);
    if (!existente) {
      // Nunca substituir uma chave perdida de um banco já protegido.
      if (jaConfigurado) throw indisponivel();
      const nova = await Crypto.AESEncryptionKey.generate(256);
      await SecureStore.setItemAsync(CHAVE, await nova.encoded('hex'), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    await chave();
  })().catch(() => { throw indisponivel(); }).finally(() => { preparando = null; });
  return preparando;
}

export function estaCifrado(valor) { return typeof valor === 'string' && valor.startsWith(PREFIXO); }

export async function cifrarTexto(valor, contexto) {
  const sealed = await Crypto.aesEncryptAsync(new TextEncoder().encode(valor), await chave(), {
    nonce: { length: 12 }, tagLength: 16, additionalData: new TextEncoder().encode(contexto),
  });
  return PREFIXO + await sealed.combined('base64');
}

export async function decifrarTexto(valor, contexto) {
  if (!estaCifrado(valor)) throw new Error('Registro local sem proteção reconhecida. Reinicie o aplicativo para concluir a atualização.');
  try {
    const sealed = Crypto.AESSealedData.fromCombined(valor.slice(PREFIXO.length), { ivLength: 12, tagLength: 16 });
    const bytes = await Crypto.aesDecryptAsync(sealed, await chave(), { additionalData: new TextEncoder().encode(contexto) });
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error('Não foi possível verificar os dados locais. O registro foi preservado; não desinstale o aplicativo e procure o responsável pelo suporte.');
  }
}
