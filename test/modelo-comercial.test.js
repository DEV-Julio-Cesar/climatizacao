const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '../src/database/patches/010_modelo_comercial_equipamentos.sql'), 'utf8');

test('modelo comercial mantém isolamento de filial e local por empresa', () => {
  assert.match(sql, /FOREIGN KEY\(filial_id,empresa_id\) REFERENCES filiais\(id,empresa_id\)/);
  assert.match(sql, /FOREIGN KEY\(local_estoque_id,empresa_id\) REFERENCES locais_estoque\(id,empresa_id\)/);
  assert.match(sql, /idx_unidades_empresa_serie/);
});

test('equipamento serializado não pode ser vendido duas vezes', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_venda_unidade_unica/);
  assert.match(sql, /tipo='EQUIPAMENTO' AND unidade_estoque_id IS NOT NULL AND quantidade=1/);
});

test('modelo prepara documento cifrado e busca por hash sem remover legado', () => {
  assert.match(sql, /documento_cifrado TEXT/);
  assert.match(sql, /documento_hash CHAR\(64\)/);
  assert.match(sql, /idx_clientes_empresa_documento_hash/);
  assert.doesNotMatch(sql, /DROP (COLUMN|TABLE)/i);
});

test('arquivos possuem integridade, autoria e exclusão lógica', () => {
  assert.match(sql, /checksum_sha256 CHAR\(64\) NOT NULL/);
  assert.match(sql, /criado_por INTEGER REFERENCES usuarios/);
  assert.match(sql, /deleted_at TIMESTAMPTZ/);
});
