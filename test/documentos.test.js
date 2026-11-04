const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/database');
const DocumentoService = require('../src/services/DocumentoService');
const worker = require('../src/services/DocumentoWorker');

test('worker preserva tarefa em falha e conclui somente após geração e envio', async () => {
  const query = db.query, gerar = DocumentoService.gerarDocumento;
  const atualizacoes = [];
  let falhar = true;
  db.query = async (sql, args) => {
    if (sql.includes('RETURNING *')) return { rows: [{ os_id: 5, empresa_id: 3, tentativas: 1 }] };
    atualizacoes.push({ sql, args }); return { rows: [] };
  };
  DocumentoService.gerarDocumento = async (id, usuario) => {
    assert.equal(id, 5); assert.equal(usuario.empresa_id, 3);
    if (falhar) throw new Error('Meta indisponível');
  };
  try {
    await worker.processar();
    assert.ok(atualizacoes[0].sql.includes('executar_em=NOW()'));
    assert.ok(atualizacoes[0].args[2] >= 30);
    falhar = false;
    await worker.processar();
    assert.ok(atualizacoes[1].sql.includes('concluido_em=NOW()'));
  } finally { db.query = query; DocumentoService.gerarDocumento = gerar; }
});
