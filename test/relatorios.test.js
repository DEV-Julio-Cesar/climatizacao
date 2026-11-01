const test = require('node:test');
const assert = require('node:assert/strict');
const { _csv: csv } = require('../src/controllers/RelatorioController');

test('CSV usa BOM, separador brasileiro e neutraliza fórmulas', () => {
  const resultado = csv([{ cliente: '=2+2', observacao: 'Peça "premium"', valor: 10.5 }]);
  assert.ok(resultado.startsWith('\uFEFF'));
  assert.match(resultado, /"cliente";"observacao";"valor"/);
  assert.match(resultado, /"'=2\+2"/);
  assert.match(resultado, /"Peça ""premium"""/);
});

test('CSV vazio ainda preserva codificação reconhecida pelo Excel', () => {
  assert.equal(csv([]), '\uFEFF');
});
