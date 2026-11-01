process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-com-tamanho-adequado';
const test = require('node:test');
const assert = require('node:assert/strict');
const ArquivoUrl = require('../src/services/ArquivoUrlService');

test('URL de foto assinada é temporária e vinculada à chave', () => {
  const url = ArquivoUrl.assinarFoto('https://api.example/foto-antiga.jpg', 'abc', 60);
  const dados = new URL(url);
  assert.equal(dados.pathname, '/arquivos/fotos/abc');
  assert.equal(ArquivoUrl.validarFoto('abc', dados.searchParams.get('exp'), dados.searchParams.get('sig')), true);
  assert.equal(ArquivoUrl.validarFoto('outra', dados.searchParams.get('exp'), dados.searchParams.get('sig')), false);
});

test('assinatura adulterada ou expiração excessiva é rejeitada', () => {
  const url = new URL(ArquivoUrl.assinarFoto('/arquivos/fotos/abc', 'abc', 60), 'https://api.example');
  assert.equal(ArquivoUrl.validarFoto('abc', url.searchParams.get('exp'), `${url.searchParams.get('sig')}x`), false);
  assert.equal(ArquivoUrl.validarFoto('abc', Math.floor(Date.now()/1000)+7200, url.searchParams.get('sig')), false);
});
