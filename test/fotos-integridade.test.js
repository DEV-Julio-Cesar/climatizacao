const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '../src/database/patches/011_fotos_os_integridade.sql'), 'utf8');

test('fotos de OS possuem tenant, autoria e integridade verificável', () => {
  assert.match(sql, /empresa_id INTEGER REFERENCES empresas/);
  assert.match(sql, /criado_por INTEGER REFERENCES usuarios/);
  assert.match(sql, /checksum_sha256 CHAR\(64\)/);
  assert.match(sql, /tamanho_bytes BIGINT/);
});

test('idempotência de upload é isolada por empresa', () => {
  assert.match(sql, /ON os_fotos\(empresa_id,client_uuid\)/);
  assert.match(sql, /DROP INDEX IF EXISTS idx_os_fotos_client_uuid/);
});
