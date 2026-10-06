process.env.JWT_SECRET = 'segredo-de-teste-com-tamanho-adequado';
process.env.APP_URL = 'http://localhost:3000';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const db = require('../src/config/database');

async function request(server, pathname, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, options);
  return { status: response.status, body: await response.json() };
}

const token = jwt.sign({ usuario_id: 7, empresa_id: 3, perfil: 'TECNICO' }, process.env.JWT_SECRET);
let server;

test.before(() => { server = createApp().listen(0); });
test.after(async () => { await new Promise((resolve) => server.close(resolve)); await db.pool.end(); });

test('health check responde sem autenticação', async () => {
  const result = await request(server, '/health');
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'ok');
});

test('rota protegida recusa chamada sem token', async () => {
  const result = await request(server, '/os/agenda');
  assert.equal(result.status, 401);
});

test('validação rejeita campos de tenant enviados pelo cliente', async () => {
  const result = await request(server, '/os', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empresa_id: 99, cliente_id: 1, tipo_servico: 'LIMPEZA', descricao_problema: 'Teste válido',
    }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.erro, 'Falha na validação de entrada.');
});

test('criação usa empresa e técnico do token', async () => {
  const originalTransaction = db.transaction;
  db.transaction = async (callback) => callback({
    query: async (sql, params) => {
      if (sql.includes('FROM clientes')) return { rows: [{ id: params[0] }] };
      if (sql.includes('FROM usuarios')) {
        assert.deepEqual(params, [7, 3]);
        return { rows: [{ id: 7 }] };
      }
      if (sql.includes('INSERT INTO ordens_servico')) {
        assert.equal(params[0], 3);
        assert.equal(params[3], 7);
        return { rows: [{ id: 10, status: 'ABERTA', empresa_id: 3, tecnico_id: 7 }] };
      }
      if (sql.includes('INSERT INTO os_historico')) return { rows: [] };
      throw new Error(`SQL não esperado: ${sql}`);
    },
  });
  try {
    const result = await request(server, '/os', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: 1, tipo_servico: 'LIMPEZA', descricao_problema: 'Limpeza completa' }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.os.empresa_id, 3);
  } finally { db.transaction = originalTransaction; }
});

test('técnico não pode reagendar O.S.', async () => {
  const result = await request(server, '/os/1/reagendar', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tecnico_id: 2, agendado_para: '2026-10-07T12:00:00-03:00' }),
  });
  assert.equal(result.status, 403);
});
