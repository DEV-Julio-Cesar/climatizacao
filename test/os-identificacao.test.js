const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '../src/database/patches/012_os_numero_snapshots.sql'), 'utf8');

test('número da OS é sequencial por empresa e ano com incremento atômico', () => {
  assert.match(sql, /PRIMARY KEY\(empresa_id,ano\)/);
  assert.match(sql, /ON CONFLICT\(empresa_id,ano\) DO UPDATE/);
  assert.match(sql, /OS-'\|\|ano_os\|\|'-'\|\|LPAD\(sequencia::TEXT,6,'0'\)/);
});

test('trigger captura cliente, endereço e equipamento antes da inserção', () => {
  assert.match(sql, /BEFORE INSERT ON ordens_servico/);
  assert.match(sql, /NEW\.cliente_snapshot := jsonb_build_object/);
  assert.match(sql, /NEW\.endereco_execucao_snapshot := jsonb_build_object/);
  assert.match(sql, /NEW\.equipamento_snapshot := jsonb_build_object/);
});

test('ordens históricas recebem identificação explícita sem consumir sequência nova', () => {
  assert.match(sql, /OS-LEGADO-/);
  assert.doesNotMatch(sql, /DELETE FROM ordens_servico/i);
});
