const fs = require('fs');
const path = require('path');

async function aplicarMigracoes(db, diretorio = __dirname) {
  const schema = fs.readFileSync(path.join(diretorio, 'migration.sql'), 'utf8');
  await db.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(782104)');
    await client.query(schema);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const pasta = path.join(diretorio, 'patches');
    for (const nome of fs.readdirSync(pasta).filter(nome => nome.endsWith('.sql')).sort()) {
      const aplicada = await client.query('SELECT nome FROM schema_migrations WHERE nome=$1', [nome]);
      if (aplicada.rows.length) continue;
      await client.query(fs.readFileSync(path.join(pasta, nome), 'utf8'));
      await client.query('INSERT INTO schema_migrations(nome) VALUES ($1)', [nome]);
    }
  });
}

async function migrate() {
  require('dotenv').config();
  const db = require('../config/database');
  try {
    await aplicarMigracoes(db);
    console.log('Migration aplicada com sucesso.');
  } catch (error) {
    console.error('Falha na migration:', error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) migrate();
module.exports = { aplicarMigracoes };
