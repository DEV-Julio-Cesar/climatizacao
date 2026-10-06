const { Pool } = require('pg');

// O Pool gerencia múltiplas conexões simultâneas, essencial para um SaaS
// onde vários técnicos de várias empresas estarão enviando O.S. ao mesmo tempo.
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'clima_saas',
  password: process.env.DB_PASSWORD || 'sua_senha_aqui',
  port: process.env.DB_PORT || 5432,
});

pool.on('error', (err, client) => {
  console.error('Erro inesperado no banco de dados', err);
  process.exit(-1);
});

module.exports = {
  // Envolvemos a query em uma função para facilitar os logs ou tratamentos globais
  query: (text, params) => pool.query(text, params),
};