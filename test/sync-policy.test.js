const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_TENTATIVAS, processarFila } = require('../mobile/src/services/syncPolicy.cjs');

const item = (id, tentativas = 0) => ({ id, tipo: 'EVENTO_OS', tentativas,
  client_uuid: `uuid-${id}`, payload: JSON.stringify({ os_id: id, _client_uuid: `uuid-${id}` }) });

function contexto(handler = async () => {}) {
  const chamadas = { despacho: [], removidos: [], falhas: [], descartados: [] };
  return { chamadas, deps: {
    despachar: async (tipo, payload, uuid) => { chamadas.despacho.push({ tipo, payload, uuid }); return handler(payload.os_id); },
    remover: async id => chamadas.removidos.push(id),
    registrarFalha: async (id, erro) => chamadas.falhas.push({ id, erro }),
    descartar: async id => chamadas.descartados.push(id),
  } };
}

test('sincronização respeita FIFO e remove somente após sucesso', async () => {
  const ctx = contexto();
  assert.deepEqual(await processarFila([item(1), item(2), item(3)], ctx.deps), { enviados: 3 });
  assert.deepEqual(ctx.chamadas.despacho.map(c => c.payload.os_id), [1, 2, 3]);
  assert.deepEqual(ctx.chamadas.removidos, [1, 2, 3]);
});

test('conflito idempotente é sucesso e não bloqueia a fila', async () => {
  const ctx = contexto(async id => { if (id === 1) throw Object.assign(new Error('Já sincronizado'), { status: 409 }); });
  assert.deepEqual(await processarFila([item(1), item(2)], ctx.deps), { enviados: 2 });
  assert.deepEqual(ctx.chamadas.removidos, [1, 2]);
  assert.deepEqual(ctx.chamadas.falhas, []);
});

test('erro 4xx registra falha e continua nos próximos itens', async () => {
  const ctx = contexto(async id => { if (id === 1) throw Object.assign(new Error('Dados inválidos'), { status: 422 }); });
  assert.deepEqual(await processarFila([item(1), item(2)], ctx.deps), { enviados: 1 });
  assert.deepEqual(ctx.chamadas.falhas, [{ id: 1, erro: 'Dados inválidos' }]);
  assert.deepEqual(ctx.chamadas.removidos, [2]);
});

test('erro de rede ou 5xx interrompe a fila', async () => {
  for (const erro of [new Error('Sem rede'), Object.assign(new Error('Indisponível'), { status: 503 })]) {
    const ctx = contexto(async () => { throw erro; });
    assert.deepEqual(await processarFila([item(1), item(2)], ctx.deps), { enviados: 0 });
    assert.equal(ctx.chamadas.despacho.length, 1);
  }
});

test('quinta falha descarta o item e libera o restante da fila', async () => {
  const ctx = contexto(async id => { if (id === 1) throw Object.assign(new Error('Falha definitiva'), { status: 422 }); });
  assert.deepEqual(await processarFila([item(1, MAX_TENTATIVAS - 1), item(2)], ctx.deps), { enviados: 1 });
  assert.deepEqual(ctx.chamadas.descartados, [1]);
  assert.deepEqual(ctx.chamadas.removidos, [2]);
});
