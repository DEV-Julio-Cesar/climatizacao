process.env.JWT_SECRET = 'segredo-de-teste-com-tamanho-adequado';
process.env.APP_URL = 'http://localhost:3000';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const db = require('../src/config/database');
const OsModel = require('../src/models/OsModel');

async function request(server, pathname, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, options);
  return { status: response.status, body: await response.json() };
}

const token = jwt.sign({ usuario_id: 7, empresa_id: 3, perfil: 'TECNICO' }, process.env.JWT_SECRET);
const tokenRestrito = jwt.sign({ usuario_id: 8, empresa_id: 3, perfil: 'TECNICO', permissoes: [] }, process.env.JWT_SECRET);
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

test('permissão granular bloqueia agenda mesmo com token válido', async () => {
  const result = await request(server, '/os/agenda', { headers: { Authorization: `Bearer ${tokenRestrito}` } });
  assert.equal(result.status, 403);
  assert.equal(result.body.erro, 'Permissão necessária: AGENDA_VISUALIZAR.');
});

test('agenda rejeita filtro desconhecido antes de consultar o banco', async () => {
  const result = await request(server, '/os/agenda?filtro=QUALQUER', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.erro, 'Filtro de agenda inválido.');
});

test('check-in exige coordenadas válidas', async () => {
  const result = await request(server, '/os/10/eventos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento: 'CHECKIN' }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.erro, 'Falha na validação de entrada.');
});

test('execução rejeita item de catálogo de outra empresa', async () => {
  const executor = { query: async () => ({ rows: [] }) };
  await assert.rejects(() => OsModel.salvarExecucao(10, 3, {
    diagnostico: 'Teste', solucao_aplicada: 'Teste', recomendacoes: '', garantia_dias: 0,
    retorno_necessario: false, checklist: [], medicoes: {},
    itens: [{ tipo: 'PECA', referencia_id: 999, descricao: 'Peça externa', quantidade: 1, valor_unitario: 10 }],
  }, executor), (error) => error.status === 400 && /catálogo inválido/.test(error.message));
});

test('registro push rejeita token malformado', async () => {
  const result = await request(server, '/dispositivos/push', {
    method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ token:'token-invalido', plataforma:'android' }),
  });
  assert.equal(result.status, 400);
});

test('técnico com acesso à agenda consegue carregar a lista de responsáveis', async () => {
  const originalQuery = db.query;
  db.query = async (sql, params) => {
    assert.match(sql, /FROM usuarios/);
    assert.deepEqual(params, [3]);
    return { rows: [{ id: 7, nome: 'Técnico', perfil: 'TECNICO' }] };
  };
  try {
    const result = await request(server, '/tecnicos', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(result.status, 200);
    assert.equal(result.body[0].id, 7);
  } finally { db.query = originalQuery; }
});

test('usuário sem permissão não altera catálogo', async () => {
  const result = await request(server, '/catalogo/produtos/1', {
    method:'PATCH', headers:{ Authorization:`Bearer ${tokenRestrito}`, 'Content-Type':'application/json' }, body:'{}',
  });
  assert.equal(result.status, 403);
});

test('usuário sem permissão não inativa cliente', async () => {
  const result = await request(server, '/clientes/1', {
    method:'DELETE', headers:{ Authorization:`Bearer ${tokenRestrito}` },
  });
  assert.equal(result.status, 403);
});
