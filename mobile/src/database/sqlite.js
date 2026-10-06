import * as SQLite from 'expo-sqlite';

let database;
async function db() {
  if (!database) database = await SQLite.openDatabaseAsync('climasaas_offline.db');
  return database;
}

export async function initDB() {
  const connection = await db();
  await connection.execAsync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS fila_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      payload TEXT NOT NULL,
      tentativas INTEGER NOT NULL DEFAULT 0,
      ultimo_erro TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
}

export async function enfileirar(tipo, payload) {
  const connection = await db();
  return connection.runAsync('INSERT INTO fila_sync (tipo, payload) VALUES (?, ?)', tipo, JSON.stringify(payload));
}
export async function listarFila() { return (await db()).getAllAsync('SELECT * FROM fila_sync ORDER BY id'); }
export async function removerFila(id) { return (await db()).runAsync('DELETE FROM fila_sync WHERE id = ?', id); }
export async function registrarFalha(id, erro) {
  return (await db()).runAsync('UPDATE fila_sync SET tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ?', String(erro).slice(0, 500), id);
}

// Compatibilidade com o nome usado pela tela antiga.
export const salvarOsLocal = (payload) => enfileirar('CRIAR_OS', payload);
