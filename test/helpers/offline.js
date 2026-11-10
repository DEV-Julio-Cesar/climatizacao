const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function carregar(arquivo, nomes, deps, retornos) {
  const fonte = fs.readFileSync(arquivo, 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  return new Function(...nomes, `${fonte}\nreturn {${retornos}};`)(...deps);
}
// Adapter de testes para a API AES do Expo. Usa AES-GCM real do Node;
// a integração com Keystore/Keychain e módulos nativos exige aparelho.
const bytes = valor => typeof valor === 'string' ? Buffer.from(valor, 'base64') : Buffer.from(valor);
class Key {
  constructor(valor) { this.valor = Buffer.from(valor); }
  static async generate() { return new Key(crypto.randomBytes(32)); }
  static async import(valor, encoding) { return new Key(typeof valor === 'string' ? Buffer.from(valor, encoding) : valor); }
  async encoded(encoding) { return this.valor.toString(encoding); }
}
class Sealed {
  constructor(valor) { this.valor = bytes(valor); }
  static fromCombined(valor) { return new Sealed(valor); }
  async combined(encoding) { return encoding === 'base64' ? this.valor.toString('base64') : this.valor; }
}
const Crypto = {
  randomUUID: crypto.randomUUID, AESEncryptionKey: Key, AESSealedData: Sealed,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algoritmo, valor) => crypto.createHash('sha256').update(valor).digest('hex'),
  async aesEncryptAsync(valor, key, options) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key.valor, iv);
    cipher.setAAD(bytes(options.additionalData));
    return new Sealed(Buffer.concat([iv, cipher.update(bytes(valor)), cipher.final(), cipher.getAuthTag()]));
  },
  async aesDecryptAsync(sealed, key, options) {
    const data = sealed.valor, cipher = crypto.createDecipheriv('aes-256-gcm', key.valor, data.subarray(0, 12));
    cipher.setAAD(bytes(options.additionalData)); cipher.setAuthTag(data.subarray(-16));
    return new Uint8Array(Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]));
  },
};
function ambiente(arquivo = ':memory:') {
  const banco = new DatabaseSync(arquivo);
  let conta = { id: 7, empresa_id: 3 };
  const segredos = new Map(), arquivos = new Map(), acoes = [];
  const storage = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only', isAvailableAsync: async () => true,
    getItemAsync: async key => key === 'climasaas_usuario' ? JSON.stringify(conta) : segredos.get(key) || null,
    setItemAsync: async (key, valor, options) => { acoes.push(['chave', options]); segredos.set(key, valor); },
  };
  const adapter = {
    execAsync: async sql => banco.exec(sql),
    getFirstAsync: async (sql, ...args) => banco.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => banco.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => { const r = banco.prepare(sql).run(...args); return { ...r, lastInsertRowId: Number(r.lastInsertRowid) }; },
    withTransactionAsync: async fn => { banco.exec('BEGIN'); try { const r = await fn(); banco.exec('COMMIT'); return r; } catch (e) { banco.exec('ROLLBACK'); throw e; } },
  };
  const FileSystem = {
    documentDirectory: 'file:///documents/', cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
    makeDirectoryAsync: async () => {},
    readAsStringAsync: async uri => { if (!arquivos.has(uri)) throw new Error('Arquivo ausente'); return arquivos.get(uri); },
    writeAsStringAsync: async (uri, valor) => { acoes.push(['gravar', uri]); arquivos.set(uri, valor); },
    getInfoAsync: async uri => ({ exists: arquivos.has(uri) }),
    deleteAsync: async uri => {
      acoes.push(['remover', uri]);
      if (uri.endsWith('/')) for (const nome of arquivos.keys()) { if (nome.startsWith(uri)) arquivos.delete(nome); }
      else arquivos.delete(uri);
    },
  };
  const cofre = carregar('mobile/src/services/OfflineCrypto.js', ['Crypto', 'SecureStore'], [Crypto, storage], 'inicializarCofre,cifrarTexto,decifrarTexto,estaCifrado');
  const fotos = carregar('mobile/src/services/OfflineArquivos.js', ['FileSystem', 'Crypto', 'cifrarTexto', 'decifrarTexto'], [FileSystem, Crypto, cofre.cifrarTexto, cofre.decifrarTexto], 'guardarFoto,guardarBase64,comFotoParaUpload,limparTemporariosUpload,protegerFotoExistente,removerArquivoPrivado,arquivoProtegido');
  const abrirSqlite = () => carregar('mobile/src/database/sqlite.js', ['SQLite', 'Crypto', 'SecureStore', 'Platform', ...Object.keys(cofre), 'protegerFotoExistente', 'removerArquivoPrivado', 'limparTemporariosUpload'],
    [{ openDatabaseAsync: async () => adapter }, Crypto, storage, { OS: 'android' }, ...Object.values(cofre), fotos.protegerFotoExistente, fotos.removerArquivoPrivado, fotos.limparTemporariosUpload],
    'initDB,enfileirar,enfileirarLote,listarFila,salvarCache,lerCache,listarFilaLegada,assumirLegado,removerFila,registrarFalha,limparCacheDaConta');
  return { banco, adapter, segredos, arquivos, acoes, cofre, fotos, storage, FileSystem, abrirSqlite,
    get conta() { return conta; }, set conta(v) { conta = v; } };
}
module.exports = { carregar, ambiente, Crypto };
