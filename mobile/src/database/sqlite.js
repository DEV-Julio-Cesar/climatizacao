import * as SQLite from 'expo-sqlite';

// Abre ou cria o arquivo de banco de dados dentro do celular
const db = SQLite.openDatabase('climasaas_offline.db');

export const initDB = () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      // Cria a tabela local para armazenar O.S. pendentes de envio
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS os_pendentes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          os_id INTEGER,
          tipo_servico TEXT,
          descricao TEXT,
          status TEXT,
          foto_antes_uri TEXT,
          foto_depois_uri TEXT,
          assinatura_uri TEXT,
          sincronizado INTEGER DEFAULT 0
        );`,
        [],
        () => resolve(true),
        (_, error) => reject(error)
      );
    });
  });
};

export const salvarOsLocal = (osData) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `INSERT INTO os_pendentes (os_id, tipo_servico, descricao, status, foto_antes_uri) 
         VALUES (?, ?, ?, ?, ?)`,
        [osData.os_id, osData.tipo_servico, osData.descricao, 'PENDENTE_SYNC', osData.foto_antes_uri],
        (_, result) => resolve(result),
        (_, error) => reject(error)
      );
    });
  });
};

export const buscarOsNaoSincronizadas = () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `SELECT * FROM os_pendentes WHERE sincronizado = 0`,
        [],
        (_, result) => resolve(result.rows._array),
        (_, error) => reject(error)
      );
    });
  });
};

export const marcarComoSincronizada = (idLocal) => {
  db.transaction((tx) => {
    tx.executeSql(`UPDATE os_pendentes SET sincronizado = 1 WHERE id = ?`, [idLocal]);
  });
};