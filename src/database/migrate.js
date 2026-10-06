require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function migrate() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migration.sql'), 'utf8');
    await db.query(sql);
    console.log('Migration aplicada com sucesso.');
  } catch (error) {
    console.error('Falha na migration:', error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

migrate();
