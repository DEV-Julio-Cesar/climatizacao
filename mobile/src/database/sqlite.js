import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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

export async function initDB() {
  const connection = await db();

  // Schema base — cria tabelas se não existirem (idempotente)
  await connection.execAsync(`
    PRAGMA journal_mode = WAL;
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
  return inserirFila(await db(), await contaAtual(), tipo, payload);
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
    JSON.stringify(payloadComUuid),
    uuid,
    conta,
  );
}

export async function listarFila() {
  return (await db()).getAllAsync('SELECT * FROM fila_sync WHERE conta=? ORDER BY id', await contaAtual());
}

export async function enfileirarLote(operacoes, contaEsperada) {
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
  return (await db()).runAsync('DELETE FROM fila_sync WHERE id = ? AND conta=?', id, await contaAtual());
}

/**
 * Remove permanentemente um item da fila após atingir MAX_TENTATIVAS.
 * Alias semântico de removerFila — distingue descarte por excesso de erros
 * de remoção por sucesso, facilitando leitura no SyncService.
 */
export async function descartar(id) {
  return removerFila(id);
}

export async function registrarFalha(id, erro) {
  return (await db()).runAsync(
    'UPDATE fila_sync SET tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ? AND conta=?',
    String(erro).slice(0, 500),
    id,
    await contaAtual(),
  );
}

export async function salvarCache(chave, valor) {
  return (await db()).runAsync(
    `INSERT INTO cache_dados(chave,valor,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor,updated_at=CURRENT_TIMESTAMP`,
    `${await contaAtual()}:${chave}`,
    JSON.stringify(valor),
  );
}

export async function lerCache(chave) {
  const item = await (await db()).getFirstAsync(
    'SELECT valor,updated_at FROM cache_dados WHERE chave=?',
    `${await contaAtual()}:${chave}`,
  );
  return item ? { dados: JSON.parse(item.valor), atualizado_em: item.updated_at } : null;
}

export async function limparFila() {
  return (await db()).runAsync('DELETE FROM fila_sync WHERE conta=?', await contaAtual());
}

// Compatibilidade com o nome usado pela tela antiga.
export const salvarOsLocal = (payload) => enfileirar('CRIAR_OS', payload);

export async function listarFilaLegada() {
  const usuario = JSON.parse(await SecureStore.getItemAsync('climasaas_usuario') || 'null');
  if (!['GESTOR','ADMIN'].includes(usuario?.perfil)) return [];
  return (await db()).getAllAsync("SELECT * FROM fila_sync WHERE conta='legado' ORDER BY id LIMIT 1000");
}

export async function assumirLegado(ids) {
  const conta = await contaAtual();
  const connection = await db();
  let recuperados = 0;
  for (const id of ids) {
    const resultado = await connection.runAsync("UPDATE fila_sync SET conta=?,tentativas=0,ultimo_erro=NULL,client_uuid=CASE WHEN client_uuid='' THEN ? ELSE client_uuid END WHERE id=? AND conta='legado'", conta, Crypto.randomUUID(), id);
    recuperados += resultado.changes;
  }
  return recuperados;
}
