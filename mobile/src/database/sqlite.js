import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
const connections=new Map();
const keys=new Map();
export async function obterEscopoOffline(){
 const token=await SecureStore.getItemAsync('climasaas_token');
 const raw=await SecureStore.getItemAsync('climasaas_usuario');
 const u=raw?JSON.parse(raw):null;
 if(!token||!Number.isInteger(u?.empresa_id)||!Number.isInteger(u?.id))throw Object.assign(new Error('Conta offline não autenticada.'),{status:503});
 return `${u.empresa_id}_${u.id}`;
}
export async function verificarEscopoOffline(scope){if(await obterEscopoOffline()!==scope)throw Object.assign(new Error('A conta mudou. Sincronização interrompida.'),{status:503});}
async function key(scope){
 if(!keys.has(scope))keys.set(scope,(async()=>{
  const name=`climasaas_offline_key_${scope}`;
  let raw=await SecureStore.getItemAsync(name);
  if(!raw){const k=await Crypto.AESEncryptionKey.generate();raw=await k.encoded('base64');await SecureStore.setItemAsync(name,raw,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
  return Crypto.AESEncryptionKey.import(raw,'base64');
 })().catch(e=>{keys.delete(scope);throw e;}));
 return keys.get(scope);
}
async function encrypt(value,scope){return (await Crypto.aesEncryptAsync(new TextEncoder().encode(JSON.stringify(value)),await key(scope),{additionalData:new TextEncoder().encode(scope)})).combined('base64');}
async function decrypt(value,scope){const bytes=await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(value),await key(scope),{additionalData:new TextEncoder().encode(scope)});return JSON.parse(new TextDecoder().decode(bytes));}
async function db(scope){
 if(!/^\d+_\d+$/.test(scope))throw new Error('Escopo inválido.');
 if(!connections.has(scope))connections.set(scope,(async()=>{
  // Legacy climasaas_offline.db is deliberately never opened or attributed to a new account.
  const c=await SQLite.openDatabaseAsync(`climasaas_${scope}_v2.db`);
  await c.execAsync(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS fila_sync(id INTEGER PRIMARY KEY AUTOINCREMENT,tipo TEXT NOT NULL,payload TEXT NOT NULL,client_uuid TEXT NOT NULL UNIQUE,tentativas INTEGER NOT NULL DEFAULT 0,ultimo_erro TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS cache_dados(chave TEXT PRIMARY KEY,valor TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  DELETE FROM cache_dados WHERE updated_at < datetime('now','-7 days');`);
  return c;
 })().catch(e=>{connections.delete(scope);throw e;}));
 return connections.get(scope);
}
export async function initDB(){try{return await db(await obterEscopoOffline());}catch(e){if(e.status!==503)throw e;}}
export async function enfileirar(tipo,payload,clientUuid=null){const scope=await obterEscopoOffline();const uuid=clientUuid||Crypto.randomUUID();const c=await db(scope);const sealed=await encrypt({...payload,_client_uuid:uuid},scope);await verificarEscopoOffline(scope);return c.runAsync('INSERT OR IGNORE INTO fila_sync(tipo,payload,client_uuid) VALUES(?,?,?)',tipo,sealed,uuid);}
export async function listarFila(scope){scope=scope||await obterEscopoOffline();await verificarEscopoOffline(scope);const rows=await (await db(scope)).getAllAsync('SELECT * FROM fila_sync ORDER BY id');return Promise.all(rows.map(async r=>({...r,payload:JSON.stringify(await decrypt(r.payload,scope))})));}
export async function removerFila(id,scope){scope=scope||await obterEscopoOffline();return (await db(scope)).runAsync('DELETE FROM fila_sync WHERE id=?',id);}
export const descartar=removerFila;
export async function registrarFalha(id,erro,scope){scope=scope||await obterEscopoOffline();return (await db(scope)).runAsync('UPDATE fila_sync SET tentativas=tentativas+1,ultimo_erro=? WHERE id=?','Falha na sincronização; tente novamente.',id);}
export async function salvarCache(chave,valor,scope){scope=scope||await obterEscopoOffline();const c=await db(scope);const sealed=await encrypt(valor,scope);await verificarEscopoOffline(scope);return c.runAsync('INSERT INTO cache_dados(chave,valor,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor,updated_at=CURRENT_TIMESTAMP',chave,sealed);}
export async function lerCache(chave,scope){scope=scope||await obterEscopoOffline();await verificarEscopoOffline(scope);const item=await (await db(scope)).getFirstAsync("SELECT valor,updated_at FROM cache_dados WHERE chave=? AND updated_at >= datetime('now','-7 days')",chave);if(!item)return null;const dados=await decrypt(item.valor,scope);await verificarEscopoOffline(scope);return {dados,atualizado_em:item.updated_at};}
export async function limparFila(){return (await db(await obterEscopoOffline())).runAsync('DELETE FROM fila_sync');}
export const salvarOsLocal=payload=>enfileirar('CRIAR_OS',payload);
