const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const isLocal = !connectionString || /localhost|127\.0\.0\.1/.test(connectionString);

// Em produção exige certificado SSL válido (rejectUnauthorized: true).
// Para bancos locais ou testes sem SSL, defina DB_SSL_REJECT_UNAUTHORIZED=false no .env.
const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: sslRejectUnauthorized },
  // Limites de conexão seguros para ambientes serverless (Neon/Render)
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  console.error('Erro inesperado no pool PostgreSQL:', error.message);
});

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  transaction,
  pool,
};
