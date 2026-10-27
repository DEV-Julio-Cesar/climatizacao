/**
 * Script temporário: aplica os patches SQL 001 e 002 no banco de produção.
 * Lê o DATABASE_URL do .env via dotenv (já instalado no projeto).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const patches = [
  'src/database/patches/001_senha_alterada_em.sql',
  'src/database/patches/002_lgpd_auditoria.sql',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERRO: DATABASE_URL nao definida no .env');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon no Windows: o CA do sistema pode nao reconhecer o certificado
    // sslmode=require na URL ja garante criptografia; usamos false aqui
    // apenas para o patch — o backend em producao usa true com DB_SSL_REJECT_UNAUTHORIZED
    ssl: { rejectUnauthorized: false },
  });

  for (const patchFile of patches) {
    const fullPath = path.resolve(__dirname, patchFile);
    console.log(`\nAplicando: ${patchFile}`);

    try {
      const sql = fs.readFileSync(fullPath, 'utf8');
      await pool.query(sql);
      console.log(`  OK — ${patchFile} aplicado com sucesso.`);
    } catch (err) {
      // Se a coluna/tabela já existe, é um erro esperado e benigno
      if (err.code === '42701' || err.code === '42P07' || /already exists/i.test(err.message)) {
        console.log(`  SKIP — ja aplicado anteriormente (${err.message.split('\n')[0]})`);
      } else {
        console.error(`  ERRO: ${err.message}`);
        await pool.end();
        process.exit(1);
      }
    }
  }

  // Verificação: confirma que a coluna e a tabela existem
  console.log('\nVerificando...');
  try {
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'usuarios' AND column_name = 'senha_alterada_em'
    `);
    console.log(`  coluna senha_alterada_em: ${colCheck.rows.length > 0 ? 'OK' : 'NAO ENCONTRADA'}`);

    const tabCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'lgpd_auditoria'
    `);
    console.log(`  tabela lgpd_auditoria: ${tabCheck.rows.length > 0 ? 'OK' : 'NAO ENCONTRADA'}`);
  } catch (err) {
    console.error(`  ERRO na verificacao: ${err.message}`);
  }

  await pool.end();
  console.log('\nConcluido.');
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
