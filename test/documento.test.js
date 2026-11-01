process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-com-tamanho-adequado';
const test = require('node:test');
const assert = require('node:assert/strict');
const Documento = require('../src/services/DocumentoService');

test('CPF/CNPJ é cifrado com autenticação e recuperado somente com o segredo', () => {
  const protegido = Documento.proteger('529.982.247-25', 3);
  assert.notEqual(protegido.documento_cifrado, protegido.documento);
  assert.equal(Documento.decifrar(protegido.documento_cifrado), '52998224725');
  assert.equal(protegido.documento_hash.length, 64);
});

test('hash de documento é isolado por empresa', () => {
  assert.notEqual(Documento.hash('52998224725', 3), Documento.hash('52998224725', 4));
});

test('conteúdo cifrado adulterado não é exposto', () => {
  const cifrado = Documento.cifrar('52998224725');
  assert.equal(Documento.decifrar(`${cifrado}x`), null);
});
