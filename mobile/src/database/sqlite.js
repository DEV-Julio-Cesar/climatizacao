import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { inicializarCofre, cifrarTexto, decifrarTexto, estaCifrado } from '../services/OfflineCrypto';
import { protegerFotoExistente, removerArquivoPrivado, limparTemporariosUpload } from '../services/OfflineArquivos';

async function contaAtual() {
  const usuario = JSON.parse(await SecureStore.getItemAsync('climasaas_usuario') || 'null');
  if (!usuario?.id || !usuario?.empresa_id) throw new Error('Conta não identificada para armazenamento offline.');
  return `${usuario.empresa_id}:${usuario.id}`;
}

let database;
async function db() {
  if (!database) database = await SQLite.openDatabaseAsync('climasaas_offline.db');
  return database;
}

/**
 * Versão atual do schema do banco SQLite local.
 * Incremente este número sempre que adicionar uma nova migração em MIGRACOES.
 * O banco é atualizado automaticamente ao abrir o app com uma versão anterior.
 */
const SCHEMA_VERSION = 3;

/**
 * Migrações indexadas por versão de destino.
 * Cada entrada é executada exatamente uma vez, quando o banco estiver
 * na versão imediatamente anterior. Nunca remova ou reordene entradas.
 */
const MIGRACOES = {
  // v1 — schema inicial (tabelas fila_sync e cache_dados)
  1: null, // criadas no CREATE TABLE IF NOT EXISTS — sem SQL adicional

  // v2 — adiciona client_uuid + índice único de idempotência
  2: `
    ALTER TABLE fila_sync ADD COLUMN client_uuid TEXT NOT NULL DEFAULT '';
    CREATE UNIQUE INDEX IF NOT EXISTS ux_fila_tipo_uuid
      ON fila_sync (tipo, client_uuid)
      WHERE client_uuid != '';
  `,
};

let inicializacao = null;
export async function initDB() {
  if (!inicializacao) inicializacao = prepararDB().catch(error => { inicializacao = null; throw error; });
  return inicializacao;
}

async function prepararDB() {
  const connection = await db();

  // Schema base — cria tabelas se não existirem (idempotente)
  await connection.execAsync(`
    PRAGMA secure_delete = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS offline_config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS offline_limpeza (uri TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS fila_sync (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      client_uuid TEXT NOT NULL DEFAULT '',
      tentativas  INTEGER NOT NULL DEFAULT 0,
      ultimo_erro TEXT,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cache_dados (
      chave      TEXT PRIMARY KEY,
      valor      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Bug 14 — controle de versão via PRAGMA user_version.
  // Aplica as migrações pendentes em ordem crescente e atualiza a versão.
  const { user_version: versaoAtual } = await connection.getFirstAsync('PRAGMA user_version');

  for (let v = versaoAtual + 1; v <= SCHEMA_VERSION; v++) {
    const sql = MIGRACOES[v];
    if (sql) {
      for (const comando of sql.split(';').map(v => v.trim()).filter(Boolean)) await connection.execAsync(`${comando};`).catch((err) => {
        // Ignora erros de "column/index already exists" para tolerar
        // instalações parciais — registra aviso para visibilidade.
        if (!/already exists|duplicate column name/i.test(err.message)) throw err;
        console.warn(`[sqlite] migração v${v} parcialmente aplicada:`, err.message);
      });
    }
    await connection.execAsync(`PRAGMA user_version = ${v}`);
  }
  const colunas = await connection.getAllAsync('PRAGMA table_info(fila_sync)');
  if (!colunas.some(c => c.name === 'conta')) await connection.execAsync("ALTER TABLE fila_sync ADD COLUMN conta TEXT NOT NULL DEFAULT 'legado';");
  await connection.execAsync("CREATE UNIQUE INDEX IF NOT EXISTS ux_fila_tipo_uuid ON fila_sync(tipo, client_uuid) WHERE client_uuid != '';");
  await protegerDadosExistentes(connection);
  await limparTemporariosUpload();
}

const contextoFila = item => JSON.stringify(['fila', item.conta, item.tipo, item.client_uuid]);
const hashCache = chave => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, chave);
async function chaveCacheProtegida(chave) {
  if (/^(?:\d+:\d+|legado):h1:[a-f0-9]{64}$/.test(chave)) return chave;
  const partes = /^(\d+:\d+):([\s\S]*)$/.exec(chave);
  return `${partes ? partes[1] : 'legado'}:h1:${await hashCache(partes ? partes[2] : chave)}`;
}
async function abrirItem(item) {
  const contexto = contextoFila(item);
  return { ...item, payload: await decifrarTexto(item.payload, contexto),
    ultimo_erro: item.ultimo_erro ? await decifrarTexto(item.ultimo_erro, `${contexto}:erro`) : null };
}

async function protegerDadosExistentes(connection) {
  const marcador = await connection.getFirstAsync("SELECT valor FROM offline_config WHERE chave='crypto_v1'");
  await inicializarCofre(Boolean(marcador));
  if (marcador && await decifrarTexto(marcador.valor, 'verificador') !== 'climasaas-offline-v1') throw new Error('Chave local incompatível. Os dados foram preservados.');
  const novos = [];
  const migrar = async transaction => {
    const fila = await transaction.getAllAsync('SELECT * FROM fila_sync ORDER BY id');
    for (const item of fila) {
      const contexto = contextoFila(item);
      const claro = estaCifrado(item.payload) ? await decifrarTexto(item.payload, contexto) : item.payload;
      let payload = claro;
      if (item.tipo === 'FOTO_OS') {
        const dados = JSON.parse(claro);
        const protegida = await protegerFotoExistente(dados.uri);
        if (protegida !== dados.uri) {
          novos.push(protegida);
          await transaction.runAsync('INSERT OR IGNORE INTO offline_limpeza(uri) VALUES(?)', dados.uri);
          payload = JSON.stringify({ ...dados, uri: protegida });
        }
      }
      const erro = item.ultimo_erro && !estaCifrado(item.ultimo_erro) ? await cifrarTexto(item.ultimo_erro, `${contexto}:erro`) : item.ultimo_erro;
      if (!estaCifrado(item.payload) || payload !== claro || erro !== item.ultimo_erro) await transaction.runAsync('UPDATE fila_sync SET payload=?,ultimo_erro=? WHERE id=?', await cifrarTexto(payload, contexto), erro, item.id);
    }
    const caches = await transaction.getAllAsync('SELECT chave,valor,updated_at FROM cache_dados');
    for (const cache of caches) {
      const novaChave = await chaveCacheProtegida(cache.chave);
      if (novaChave !== cache.chave) {
        const claro = estaCifrado(cache.valor) ? await decifrarTexto(cache.valor, `cache:${cache.chave}`) : cache.valor;
        await transaction.runAsync(`INSERT INTO cache_dados(chave,valor,updated_at) VALUES(?,?,?)
          ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor,updated_at=excluded.updated_at
          WHERE excluded.updated_at>=cache_dados.updated_at`, novaChave, await cifrarTexto(claro, `cache:${novaChave}`), cache.updated_at);
        await transaction.runAsync('DELETE FROM cache_dados WHERE chave=?', cache.chave);
      } else if (!estaCifrado(cache.valor)) await transaction.runAsync('UPDATE cache_dados SET valor=? WHERE chave=?', await cifrarTexto(cache.valor, `cache:${cache.chave}`), cache.chave);
    }
    await transaction.runAsync("INSERT OR REPLACE INTO offline_config(chave,valor) VALUES('crypto_v1',?)", await cifrarTexto('climasaas-offline-v1', 'verificador'));
  };
  try {
    if (connection.withExclusiveTransactionAsync && Platform.OS !== 'web') await connection.withExclusiveTransactionAsync(migrar);
    else await connection.withTransactionAsync(() => migrar(connection));
  } catch (error) {
    for (const uri of novos) await removerArquivoPrivado(uri).catch(() => {});
    throw error;
  }
  // Depois do commit, revalida o marcador no próximo boot antes de qualquer leitura.
  // VACUUM/checkpoint reduzem resíduos nas páginas/WAL; não são apagamento físico
  // garantido de flash, snapshots ou backups antigos.
  await connection.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  const limpar = await connection.getAllAsync('SELECT uri FROM offline_limpeza');
  for (const { uri } of limpar) {
    await removerArquivoPrivado(uri);
    await connection.runAsync('DELETE FROM offline_limpeza WHERE uri=?', uri);
  }
}

/**
 * Enfileira uma operação offline.
 * Gera um client_uuid automaticamente para garantir idempotência no reenvio.
 * Se um item idêntico (mesmo tipo + mesmo uuid) já estiver na fila, é ignorado.
 *
 * Bug 7 — Crypto.randomUUID() pode lançar exceção em ambientes sem
 * entropia suficiente. O fallback garante que o uuid nunca seja vazio,
 * evitando que o índice único (tipo, client_uuid WHERE client_uuid != '')
 * seja bypassado e permita duplicatas na fila.
 */
export async function enfileirar(tipo, payload) {
  const ids = await enfileirarLote([{ tipo, payload }]);
  return { lastInsertRowId: ids[0] };
}

async function inserirFila(connection, conta, tipo, payload) {
  let uuid;
  try {
    uuid = await Crypto.randomUUID();
  } catch {
    // Fallback: combina timestamp com Math.random para gerar uuid único
    uuid = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  if (!uuid) {
    uuid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  // Injeta o uuid no payload para que o servidor possa usá-lo como client_uuid
  const payloadComUuid = { ...payload, _client_uuid: uuid };
  return connection.runAsync(
    'INSERT OR IGNORE INTO fila_sync (tipo, payload, client_uuid, conta) VALUES (?, ?, ?, ?)',
    tipo,
    await cifrarTexto(JSON.stringify(payloadComUuid), contextoFila({ conta, tipo, client_uuid: uuid })),
    uuid,
    conta,
  );
}

export async function listarFila() {
  await initDB();
  const conta = await contaAtual();
  const itens = await (await db()).getAllAsync('SELECT * FROM fila_sync WHERE conta=? ORDER BY id', conta);
  const abertos = [];
  for (const item of itens) abertos.push(await abrirItem(item));
  if (conta !== await contaAtual()) throw new Error('A conta mudou durante a leitura.');
  return abertos;
}

export async function enfileirarLote(operacoes, contaEsperada) {
  await initDB();
  const connection = await db();
  const conta = await contaAtual();
  if(contaEsperada && contaEsperada!==conta) throw new Error('A conta mudou. Entre na conta original para salvar este atendimento.');
  const ids = [];
  const gravar = async (transaction) => {
    for (const operacao of operacoes) {
      const resultado = await inserirFila(transaction, conta, operacao.tipo, operacao.payload);
      ids.push(Number(resultado.lastInsertRowId));
    }
    if (conta !== await contaAtual()) throw new Error('A conta mudou durante a gravação. Repita a operação.');
  };
  if (connection.withExclusiveTransactionAsync && Platform.OS !== 'web') await connection.withExclusiveTransactionAsync(gravar);
  else await connection.withTransactionAsync(() => gravar(connection));
  return ids;
}

export async function removerFila(id) {
  await initDB();
  const resultado = await (await db()).runAsync('DELETE FROM fila_sync WHERE id = ? AND conta=?', id, await contaAtual());
  if (resultado.changes !== 1) throw new Error('Operação não removida da conta ativa. Evidência preservada.');
  return resultado;
}

/**
 * Compatibilidade com consumidores antigos. Falhas repetidas não devem chamar
 * esta função: ficam preservadas para reenvio manual.
 */
export async function descartar(id) {
  return removerFila(id);
}

export async function registrarFalha(id, erro) {
  await initDB();
  const conta = await contaAtual();
  const item = await (await db()).getFirstAsync('SELECT * FROM fila_sync WHERE id=? AND conta=?', id, conta);
  if (!item) throw new Error('Operação não encontrada na conta ativa.');
  return (await db()).runAsync(
    'UPDATE fila_sync SET tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ? AND conta=?',
    await cifrarTexto(String(erro).slice(0, 500), `${contextoFila(item)}:erro`),
    id,
    conta,
  );
}

export async function salvarCache(chave, valor) {
  await initDB();
  const conta = await contaAtual();
  const chaveCompleta = `${conta}:h1:${await hashCache(chave)}`;
  const cifrado = await cifrarTexto(JSON.stringify(valor), `cache:${chaveCompleta}`);
  if (conta !== await contaAtual()) throw new Error('A conta mudou durante a gravação.');
  return (await db()).runAsync(
    `INSERT INTO cache_dados(chave,valor,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor,updated_at=CURRENT_TIMESTAMP`,
    chaveCompleta,
    cifrado,
  );
}

export async function lerCache(chave) {
  await initDB();
  const conta = await contaAtual();
  const chaveCompleta = `${conta}:h1:${await hashCache(chave)}`;
  const item = await (await db()).getFirstAsync(
    'SELECT valor,updated_at FROM cache_dados WHERE chave=?',
    chaveCompleta,
  );
  const dados = item ? JSON.parse(await decifrarTexto(item.valor, `cache:${chaveCompleta}`)) : null;
  if (conta !== await contaAtual()) throw new Error('A conta mudou durante a leitura.');
  return item ? { dados, atualizado_em: item.updated_at } : null;
}

export async function limparFila() {
  await initDB();
  return (await db()).runAsync('DELETE FROM fila_sync WHERE conta=?', await contaAtual());
}

export async function limparCacheDaConta() {
  await initDB();
  const conta = await contaAtual(), prefixo = `${conta}:`, connection = await db();
  let removidos = 0;
  const limpar = async transaction => {
    const fila = await transaction.getFirstAsync('SELECT COUNT(*) total FROM fila_sync WHERE conta=?', conta);
    if (fila.total) throw new Error('Sincronize os atendimentos pendentes antes de limpar o cache. Nenhum registro foi apagado.');
    const resultado = await transaction.runAsync('DELETE FROM cache_dados WHERE substr(chave,1,?)=?', prefixo.length, prefixo);
    removidos = resultado.changes;
    if (conta !== await contaAtual()) throw new Error('A conta mudou durante a limpeza.');
  };
  if (connection.withExclusiveTransactionAsync && Platform.OS !== 'web') await connection.withExclusiveTransactionAsync(limpar);
  else await connection.withTransactionAsync(() => limpar(connection));
  return { removidos };
}

// Compatibilidade com o nome usado pela tela antiga.
export const salvarOsLocal = (payload) => enfileirar('CRIAR_OS', payload);

export async function listarFilaLegada() {
  await initDB();
  const conta = await contaAtual();
  const usuario = JSON.parse(await SecureStore.getItemAsync('climasaas_usuario') || 'null');
  if (!['GESTOR','ADMIN'].includes(usuario?.perfil)) return [];
  const itens = await (await db()).getAllAsync("SELECT * FROM fila_sync WHERE conta='legado' ORDER BY id LIMIT 1000");
  const abertos = [];
  for (const item of itens) abertos.push(await abrirItem(item));
  if (conta !== await contaAtual()) throw new Error('A conta mudou durante a leitura.');
  return abertos;
}

export async function assumirLegado(ids) {
  await initDB();
  const conta = await contaAtual();
  const connection = await db();
  let recuperados = 0;
  const recuperar = async transaction => {
    for (const id of ids) {
      const item = await transaction.getFirstAsync("SELECT * FROM fila_sync WHERE id=? AND conta='legado'", id);
      if (!item) continue;
      const aberto = await abrirItem(item), uuid = item.client_uuid || Crypto.randomUUID();
      const dados = JSON.parse(aberto.payload);
      const payload = await cifrarTexto(JSON.stringify({ ...dados, _client_uuid: dados._client_uuid || uuid }), contextoFila({ ...item, conta, client_uuid: uuid }));
      const resultado = await transaction.runAsync("UPDATE fila_sync SET conta=?,tentativas=0,ultimo_erro=NULL,client_uuid=?,payload=? WHERE id=? AND conta='legado'", conta, uuid, payload, id);
      recuperados += resultado.changes;
    }
    if (conta !== await contaAtual()) throw new Error('A conta mudou durante a recuperação.');
  };
  if (connection.withExclusiveTransactionAsync && Platform.OS !== 'web') await connection.withExclusiveTransactionAsync(recuperar);
  else await connection.withTransactionAsync(() => recuperar(connection));
  return recuperados;
}
