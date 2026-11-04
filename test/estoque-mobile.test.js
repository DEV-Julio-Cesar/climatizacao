const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const db = require('../src/config/database');
const controller = require('../src/controllers/FinanceiroController');
const fonte = fs.readFileSync('mobile/src/services/estoque.js', 'utf8').replace(/export /g, '');
const { prepararMovimento, saldoAposMovimento } = new Function(`${fonte}; return {prepararMovimento, saldoAposMovimento};`)();

function resposta() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } }; }
function request(body, extra = {}) { return { params: { id: '9' }, usuarioLogado: { empresa_id: 3, usuario_id: 7 }, body, ...extra }; }

test('mobile aceita vírgula, ajuste para zero e calcula sem erro de ponto flutuante', () => {
  assert.deepEqual(prepararMovimento('ENTRADA', '2,50', ' compra '), { tipo: 'ENTRADA', quantidade: 2.5, observacao: 'compra' });
  assert.equal(saldoAposMovimento(0.1, prepararMovimento('ENTRADA', '0,20', 'compra')), 0.3);
  assert.equal(saldoAposMovimento(5, prepararMovimento('AJUSTE', '0', 'inventário')), 0);
  for (const valor of ['', '-2', '1.234', '1,2,3', 'NaN', 'Infinity', '1e3', '10000000000']) assert.throws(() => prepararMovimento('ENTRADA', valor, 'compra'));
  assert.throws(() => prepararMovimento('SAIDA', '0', 'avaria'), /maior que zero/);
  assert.throws(() => prepararMovimento('AJUSTE', '3', ' '), /motivo/);
});

async function comBanco(config, executar) {
  const original = db.transaction;
  const consultas = [], movimentos = [];
  let saldo = config.saldo ?? 10;
  const operacoes = new Map();
  db.transaction = async fn => fn({ query: async (sql, args) => {
    consultas.push({ sql, args });
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('SELECT fingerprint,resultado')) return { rows: operacoes.has(args[2]) ? [operacoes.get(args[2])] : [] };
    if (sql.includes('INSERT INTO operacoes_idempotentes')) { operacoes.set(args[2], { fingerprint: args[3], resultado: JSON.parse(args[4]) }); return { rows: [] }; }
    if (sql.includes('FROM produtos')) {
      assert.deepEqual(args, ['9', 3]); assert.match(sql, /empresa_id=\$2.*ativo=TRUE FOR UPDATE/);
      return { rows: config.ausente ? [] : [{ id: 9, estoque: saldo }] };
    }
    if (sql.includes('SUM(quantidade)')) { assert.deepEqual(args, ['9', 3]); assert.match(sql, /status='RESERVADO'/); return { rows: [{ reservado: config.reservado ?? 0 }] }; }
    if (sql.startsWith('UPDATE produtos')) { assert.deepEqual(args.slice(1), ['9', 3]); saldo = args[0]; return { rows: [] }; }
    if (sql.includes('INSERT INTO estoque_movimentos')) { movimentos.push(args); return { rows: [] }; }
    throw new Error(`SQL inesperado: ${sql}`);
  } });
  try { await executar({ consultas, movimentos, saldo: () => saldo }); }
  finally { db.transaction = original; }
}

test('API movimenta o saldo central e registra quantidade, empresa, usuário e motivo', async () => {
  for (const [tipo, quantidade, esperado] of [['ENTRADA', 2.5, 12.5], ['SAIDA', 3, 7], ['AJUSTE', 0, 0]]) {
    await comBanco({}, async banco => {
      const res = resposta();
      await controller.movimentar(request({ tipo, quantidade, observacao: 'Inventário/compra' }), res);
      assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { estoque: esperado });
      assert.equal(banco.saldo(), esperado);
      assert.deepEqual(banco.movimentos[0], [3, '9', tipo, quantidade, 'Inventário/compra', 7]);
    });
  }
});

test('API impede saldo negativo, redução de reservas, produto de outra empresa e estouro', async () => {
  for (const [config, body, status] of [
    [{}, { tipo: 'SAIDA', quantidade: 11 }, 422],
    [{ reservado: 8 }, { tipo: 'SAIDA', quantidade: 3 }, 422],
    [{ reservado: 1 }, { tipo: 'AJUSTE', quantidade: 0 }, 422],
    [{ ausente: true }, { tipo: 'ENTRADA', quantidade: 1 }, 404],
    [{ saldo: 9999999999.99 }, { tipo: 'ENTRADA', quantidade: 0.01 }, 422],
    [{}, { tipo: 'AJUSTE', quantidade: 10 }, 422],
  ]) await comBanco(config, async banco => {
    const res = resposta(); await controller.movimentar(request({ ...body, observacao: 'Inventário' }), res);
    assert.equal(res.statusCode, status); assert.equal(banco.movimentos.length, 0);
    assert.equal(banco.consultas.some(c => c.sql.startsWith('UPDATE produtos')), false);
  });
});

test('API valida quantidade e motivo antes de alterar estoque', async () => {
  for (const body of [
    { tipo: 'SAIDA', quantidade: 0, observacao: 'perda' },
    { tipo: 'AJUSTE', quantidade: -1, observacao: 'contagem' },
    { tipo: 'ENTRADA', quantidade: 0.001 },
    { tipo: 'AJUSTE', quantidade: 0, observacao: ' ' },
    { tipo: 'SAIDA', quantidade: 1 },
    { tipo: 'ENTRADA', quantidade: Infinity },
  ]) await comBanco({}, async banco => {
    const res = resposta(); await controller.movimentar(request(body), res);
    assert.equal(res.statusCode, 400); assert.equal(banco.consultas.length, 0);
  });
});

test('reenvio com a mesma chave não duplica movimentação e rejeita dados diferentes', async () => {
  await comBanco({}, async banco => {
    const extra = { method: 'POST', path: '/produtos/9/movimentar', get: nome => nome === 'Idempotency-Key' ? 'movimento-12345' : undefined };
    const req = request({ tipo: 'ENTRADA', quantidade: 2, observacao: 'compra' }, extra);
    for (let i = 0; i < 2; i++) {
      const res = resposta(); await controller.movimentar(req, res);
      assert.equal(res.statusCode, 200); assert.equal(res.body.estoque, 12);
    }
    assert.equal(banco.movimentos.length, 1); assert.equal(banco.saldo(), 12);
    const res = resposta();
    await controller.movimentar(request({ tipo: 'ENTRADA', quantidade: 3, observacao: 'compra' }, extra), res);
    assert.equal(res.statusCode, 409); assert.equal(banco.movimentos.length, 1);
  });
});
