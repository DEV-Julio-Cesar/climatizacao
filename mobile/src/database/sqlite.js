import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

let database;
async function db() {
  if (!database) database = await SQLite.openDatabaseAsync('climasaas_offline.db');
  return database;
}

export async function initDB() {
  const connection = await db();
  await connection.execAsync(`PRAGMA journal_mode = WAL;
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
    );`);

  // Migração segura: adiciona a coluna se ainda não existir (banco antigo)
  await connection.execAsync(`
    ALTER TABLE fila_sync ADD COLUMN client_uuid TEXT NOT NULL DEFAULT '';
  `).catch(() => {/* coluna já existe — ignorar */});

  // Índice único que garante que dois itens do mesmo tipo com o mesmo UUID
  // não coexistam na fila (INSERT OR IGNORE descarta duplicatas locais).
  await connection.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_fila_tipo_uuid
      ON fila_sync (tipo, client_uuid)
      WHERE client_uuid != '';
  `);
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
  const connection = await db();
  return connection.runAsync(
    'INSERT OR IGNORE INTO fila_sync (tipo, payload, client_uuid) VALUES (?, ?, ?)',
    tipo,
    JSON.stringify(payloadComUuid),
    uuid,
  );
}

export async function listarFila() {
  return (await db()).getAllAsync('SELECT * FROM fila_sync ORDER BY id');
}

export async function removerFila(id) {
  return (await db()).runAsync('DELETE FROM fila_sync WHERE id = ?', id);
}

/**
 * Remove permanentemente um item da fila após atingir MAX_TENTATIVAS.
 * Alias semântico de removerFila — distingue descarte por excesso de erros
 * de remoção por sucesso, facilitando leitura no SyncService.
 */
export async function descartar(id) {
  return (await db()).runAsync('DELETE FROM fila_sync WHERE id = ?', id);
}

export async function registrarFalha(id, erro) {
  return (await db()).runAsync(
    'UPDATE fila_sync SET tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ?',
    String(erro).slice(0, 500),
    id,
  );
}

export async function salvarCache(chave, valor) {
  return (await db()).runAsync(
    `INSERT INTO cache_dados(chave,valor,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor,updated_at=CURRENT_TIMESTAMP`,
    chave,
    JSON.stringify(valor),
  );
}

export async function lerCache(chave) {
  const item = await (await db()).getFirstAsync(
    'SELECT valor,updated_at FROM cache_dados WHERE chave=?',
    chave,
  );
  return item ? { dados: JSON.parse(item.valor), atualizado_em: item.updated_at } : null;
}

export async function limparFila() {
  return (await db()).runAsync('DELETE FROM fila_sync');
}

// Compatibilidade com o nome usado pela tela antiga.
export const salvarOsLocal = (payload) => enfileirar('CRIAR_OS', payload);
