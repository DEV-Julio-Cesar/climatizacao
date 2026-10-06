require('dotenv').config();
const db = require('../config/database');
const bcrypt = require('bcryptjs');

async function firstOrInsert(selectSql, selectParams, insertSql, insertParams) {
  const existing = await db.query(selectSql, selectParams);
  if (existing.rows[0]) return existing.rows[0];
  return (await db.query(insertSql, insertParams)).rows[0];
}

async function seed() {
  try {
    const empresa = (await db.query(
      `INSERT INTO empresas (nome, cnpj, email) VALUES ($1,$2,$3)
       ON CONFLICT (cnpj) DO UPDATE SET nome = EXCLUDED.nome RETURNING id,nome`,
      ['ClimaSaaS Teste', '00.000.000/0001-00', 'admin@climasaas.com']
    )).rows[0];
    const senhaHash = await bcrypt.hash('123456', 10);
    const usuario = (await db.query(
      `INSERT INTO usuarios (empresa_id,nome,email,senha_hash,perfil) VALUES ($1,$2,$3,$4,'GESTOR')
       ON CONFLICT (email) DO UPDATE SET senha_hash=EXCLUDED.senha_hash, empresa_id=EXCLUDED.empresa_id, ativo=TRUE
       RETURNING id,nome,email,perfil`,
      [empresa.id, 'Administrador', 'admin@climasaas.com', senhaHash]
    )).rows[0];
    const cliente = await firstOrInsert(
      'SELECT id,nome FROM clientes WHERE empresa_id=$1 AND nome=$2 AND deleted_at IS NULL', [empresa.id, 'Cliente Teste'],
      `INSERT INTO clientes (empresa_id,nome,telefone,endereco,latitude,longitude)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,nome`,
      [empresa.id, 'Cliente Teste', '5584988986845', 'Rua Teste, 123 - Natal/RN', -5.79448, -35.211]
    );
    const aparelho = await firstOrInsert(
      'SELECT id,marca,modelo FROM aparelhos WHERE cliente_id=$1 AND modelo=$2 AND deleted_at IS NULL', [cliente.id, 'Wind Free'],
      'INSERT INTO aparelhos (empresa_id,cliente_id,marca,modelo,capacidade) VALUES ($1,$2,$3,$4,$5) RETURNING id,marca,modelo',
      [empresa.id, cliente.id, 'Samsung', 'Wind Free', '12000 BTUs']
    );
    console.log(JSON.stringify({ empresa, usuario, cliente, aparelho, credenciais: { email: usuario.email, senha: '123456' } }, null, 2));
  } catch (error) {
    console.error('Erro no seed:', error.message); process.exitCode = 1;
  } finally { await db.pool.end(); }
}
seed();
