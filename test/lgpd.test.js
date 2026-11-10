const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const Lgpd = require('../src/controllers/LgpdController');
const Privacidade = require('../src/controllers/PrivacidadeController');
const usuario = { usuario_id: 7, empresa_id: 3, perfil: 'TECNICO' };
const gestor = { usuario_id: 9, empresa_id: 3, perfil: 'GESTOR' };
const protocolo = '00000000-0000-4000-8000-000000000001';
function req(extra = {}) { return { usuarioLogado: usuario, query: {}, body: {}, params: {}, ip: '127.0.0.1', ...extra }; }
function resposta() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, clearCookie(...args) { this.cookie = args; },
    status(v) { this.statusCode = v; return this; }, json(body) { this.body = body; return this; } };
}
async function banco(query, fn) {
  const originalQuery = db.query, originalTransaction = db.transaction;
  db.query = query; db.transaction = async executar => executar({ query });
  try { await fn(); } finally { db.query = originalQuery; db.transaction = originalTransaction; }
}

test('LGPD: resumo de gestor não exporta terceiros e informa paginação sem truncamento silencioso', async () => {
  const consultas = [];
  await banco(async (sql, args) => {
    consultas.push(sql);
    assert.ok(!sql.includes('FROM clientes'));
    assert.ok(!sql.includes('descricao_problema'));
    if (sql.includes('FROM ordens_servico')) {
      assert.deepEqual(args, [9, 3, 10, 3]);
      return { rows: [{ id: 11 }, { id: 12 }, { id: 13 }] };
    }
    return { rows: [] };
  }, async () => {
    const res = resposta(); await Lgpd.exportarDados(req({ usuarioLogado: gestor, query: { cursor: '10', limite: '2' } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.ordens_servico, [{ id: 11 }, { id: 12 }]);
    assert.deepEqual(res.body.clientes_empresa, []);
    assert.deepEqual(res.body.paginacao, { limite: 2, tem_mais: true, proximo_cursor: 12 });
    assert.match(res.body.aviso, /Não é uma cópia integral/);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.ok(consultas.some(s => s.startsWith('INSERT INTO lgpd_auditoria')));
  });
});

test('LGPD: rejeita paginação inválida e senha/confirmacao ausentes sem consultar banco', async () => {
  await banco(async () => { throw new Error('Não deveria consultar banco'); }, async () => {
    for (const query of [{ limite: '101' }, { cursor: '-1' }, { limite: '1.5' }, { empresa_id: '4' }]) {
      const res = resposta(); await Lgpd.exportarDados(req({ query }), res); assert.equal(res.statusCode, 400);
    }
    for (const body of [{}, { confirmacao: 'CONFIRMAR_EXCLUSAO' }, { confirmacao: 'OUTRA', senha_atual: 'Senha123' }]) {
      const res = resposta(); await Lgpd.excluirDados(req({ body }), res); assert.equal(res.statusCode, 400);
    }
  });
});

test('LGPD: última página explicita fim do resumo e falha de auditoria impede sucesso', async () => {
  let falha = false;
  await banco(async sql => {
    if (falha && sql.startsWith('INSERT INTO lgpd_auditoria')) throw Object.assign(new Error('Detalhe confidencial'), { code: 'AUDIT_FAILED' });
    return { rows: [] };
  }, async () => {
    const res = resposta(); await Lgpd.exportarDados(req(), res);
    assert.equal(res.body.paginacao.tem_mais, false); assert.equal(res.body.paginacao.proximo_cursor, null);
    falha = true; const erro = resposta(); await Lgpd.exportarDados(req(), erro);
    assert.equal(erro.statusCode, 500); assert.ok(!JSON.stringify(erro.body).includes('confidencial'));
  });
});

test('LGPD: senha incorreta bloqueia desativação e qualquer limpeza', async () => {
  const senha_hash = await bcrypt.hash('SenhaCerta123', 4);
  await banco(async (sql, args) => {
    assert.match(sql, /SELECT senha_hash.*FOR UPDATE/); assert.deepEqual(args, [7, 3]);
    return { rows: [{ senha_hash }] };
  }, async () => {
    const res = resposta(); await Lgpd.excluirDados(req({ body: { confirmacao: 'CONFIRMAR_EXCLUSAO', senha_atual: 'SenhaErrada123' } }), res);
    assert.equal(res.statusCode, 403); assert.equal(res.cookie, undefined);
  });
});

test('LGPD: desativação revoga acessos, apaga push/recuperação e não alega anonimização', async () => {
  const senha_hash = await bcrypt.hash('SenhaCerta123', 4), consultas = [];
  await banco(async (sql, args) => {
    consultas.push({ sql, args });
    if (sql.startsWith('SELECT senha_hash')) return { rows: [{ senha_hash }] };
    return { rows: [] };
  }, async () => {
    const res = resposta(); await Lgpd.excluirDados(req({ body: { confirmacao: 'CONFIRMAR_EXCLUSAO', senha_atual: 'SenhaCerta123' } }), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.anonimizacao_completa, false);
    const alteracao = consultas.find(q => q.sql.startsWith('UPDATE usuarios'));
    assert.match(alteracao.args[0], /^removido_[0-9a-f-]{36}@removido.invalid$/);
    assert.ok(!alteracao.sql.includes('push_token')); assert.ok(!alteracao.sql.includes('updated_at'));
    for (const inicio of ['UPDATE sessoes', 'DELETE FROM dispositivos_push', 'UPDATE recuperacoes_senha', 'UPDATE emails_recuperacao', 'INSERT INTO lgpd_auditoria']) assert.ok(consultas.some(q => q.sql.startsWith(inicio)));
    assert.ok(consultas.filter(q => !q.sql.startsWith('INSERT')).every(q => q.sql.includes('empresa_id')));
    assert.deepEqual(res.cookie, ['climasaas_refresh', { path: '/auth/refresh' }]);
  });
});

test('LGPD: falha de auditoria não retorna desativação concluída nem limpa cookie', async () => {
  const senha_hash = await bcrypt.hash('SenhaCerta123', 4);
  await banco(async sql => {
    if (sql.startsWith('SELECT senha_hash')) return { rows: [{ senha_hash }] };
    if (sql.startsWith('INSERT INTO lgpd_auditoria')) throw new Error('Falha');
    return { rows: [] };
  }, async () => {
    const res = resposta(); await Lgpd.excluirDados(req({ body: { confirmacao: 'CONFIRMAR_EXCLUSAO', senha_atual: 'SenhaCerta123' } }), res);
    assert.equal(res.statusCode, 500); assert.equal(res.cookie, undefined);
  });
});

test('privacidade: técnico não registra pedido em nome de cliente nem altera análise', async () => {
  await banco(async () => { throw new Error('Não deveria consultar banco'); }, async () => {
    const criar = resposta(); await Privacidade.criar(req({ body: { tipo: 'ACESSO', descricao: 'Quero acessar meus dados', cliente_id: 10 } }), criar);
    assert.equal(criar.statusCode, 403);
    const atualizar = resposta(); await Privacidade.atualizar(req({ params: { id: protocolo }, body: { status: 'EM_ANALISE', resposta: 'Iniciamos análise do pedido' } }), atualizar);
    assert.equal(atualizar.statusCode, 403);
  });
});

test('privacidade: listagem filtra empresa, solicitante e acesso a pedidos de clientes', async () => {
  for (const [u, esperado] of [[usuario, [3, false, 7, false, 0]], [gestor, [3, true, 9, true, 0]], [{ ...gestor, permissoes: ['GESTAO_GERENCIAR'] }, [3, true, 9, false, 0]]]) {
    await banco(async (sql, args) => { assert.match(sql, /empresa_id=\$1/); assert.deepEqual(args.slice(0, 5), esperado); return { rows: Array.from({ length: 51 }, (_, id) => ({ id })) }; }, async () => {
      const res = resposta(); await Privacidade.listar(req({ usuarioLogado: u }), res);
      assert.equal(res.statusCode, 200); assert.equal(res.body.solicitacoes.length, 50); assert.equal(res.body.tem_mais, true);
    });
  }
});

test('privacidade: cliente de outra empresa é rejeitado antes de gravar protocolo', async () => {
  await banco(async (sql, args) => {
    if (sql.includes('FROM usuarios')) return { rows: [{ id: 9 }] };
    assert.match(sql, /FROM clientes WHERE id=\$1 AND empresa_id=\$2/); assert.deepEqual(args, [555, 3]);
    return { rows: [] };
  }, async () => {
    const res = resposta(); await Privacidade.criar(req({ usuarioLogado: gestor, body: { tipo: 'EXCLUSAO', descricao: 'Solicito avaliação de exclusão', cliente_id: 555 } }), res);
    assert.equal(res.statusCode, 404);
  });
});

test('privacidade: protocolo e histórico persistem juntos e limite é aplicado por conta', async () => {
  let contagem = 0; const consultas = [];
  await banco(async (sql, args) => {
    consultas.push({ sql, args });
    if (sql.includes('FROM usuarios')) return { rows: [{ id: 7 }] };
    if (sql.includes('COUNT(*)')) return { rows: [{ total: contagem }] };
    return { rows: [] };
  }, async () => {
    const pedido = req({ body: { tipo: 'CORRECAO', descricao: 'Quero corrigir meus dados' } });
    const res = resposta(); await Privacidade.criar(pedido, res);
    assert.equal(res.statusCode, 201); assert.match(res.body.protocolo, /^[0-9a-f-]{36}$/);
    const insert = consultas.find(q => q.sql.startsWith('INSERT INTO privacidade_solicitacoes'));
    assert.deepEqual(insert.args.slice(1, 6), [3, 7, null, 'CORRECAO', 'Quero corrigir meus dados']);
    assert.ok(consultas.some(q => q.sql.startsWith('INSERT INTO privacidade_historico')));
    contagem = 10; consultas.length = 0;
    const limitado = resposta(); await Privacidade.criar(pedido, limitado);
    assert.equal(limitado.statusCode, 429); assert.ok(!consultas.some(q => q.sql.startsWith('INSERT')));
  });
});

test('privacidade: dados extras e conta desativada não geram solicitação', async () => {
  let consultou = false;
  await banco(async () => { consultou = true; return { rows: [] }; }, async () => {
    const res = resposta(); await Privacidade.criar(req({ body: { tipo: 'ACESSO', descricao: 'Quero acessar meus dados', empresa_id: 999 } }), res);
    assert.equal(res.statusCode, 400); assert.equal(consultou, false);
    const inativo = resposta(); await Privacidade.criar(req({ body: { tipo: 'ACESSO', descricao: 'Quero acessar meus dados' } }), inativo);
    assert.equal(inativo.statusCode, 401);
  });
});

test('privacidade: análise exige empresa correta e não permite concluir sem análise ou reabrir conclusão', async () => {
  for (const [pedido, statusEsperado] of [[undefined, 404], [{ status: 'RECEBIDA' }, 409], [{ status: 'CONCLUIDA' }, 409], [{ status: 'EM_ANALISE', cliente_id: 42 }, 403]]) {
    await banco(async (sql, args) => {
      assert.match(sql, /empresa_id=\$2 FOR UPDATE/); assert.deepEqual(args, [protocolo, 3]);
      return { rows: pedido ? [pedido] : [] };
    }, async () => {
      const res = resposta(); await Privacidade.atualizar(req({ usuarioLogado: { ...gestor, permissoes: ['GESTAO_GERENCIAR'] }, params: { id: protocolo }, body: { status: 'CONCLUIDA', resposta: 'Resposta de análise do pedido' } }), res);
      assert.equal(res.statusCode, statusEsperado);
    });
  }
});

test('privacidade: conclusão grava resposta e histórico sem executar exclusão de dados', async () => {
  const consultas = [];
  await banco(async (sql, args) => {
    consultas.push({ sql, args });
    if (sql.startsWith('SELECT')) return { rows: [{ status: 'EM_ANALISE', cliente_id: null }] };
    assert.ok(sql.startsWith('UPDATE privacidade_solicitacoes') || sql.startsWith('INSERT INTO privacidade_historico'));
    return { rows: [] };
  }, async () => {
    const res = resposta(); await Privacidade.atualizar(req({ usuarioLogado: gestor, params: { id: protocolo }, body: { status: 'CONCLUIDA', resposta: 'Atendimento concluído com justificativa' } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(consultas[1].args, ['CONCLUIDA', 'Atendimento concluído com justificativa', 9, protocolo, 3]);
    assert.equal(consultas[2].args[3], 'Atendimento concluído com justificativa');
  });
});

test('privacidade: filtros inválidos e identificador de reenvio malformado não chegam ao banco', async () => {
  await banco(async () => assert.fail('Não deveria consultar banco'), async () => {
    for (const query of [{ status: 'INVALIDO' }, { tipo: 'INVALIDO' }, { protocolo: 'incompleto' }, { empresa_id: '4' }]) {
      const res = resposta(); await Privacidade.listar(req({ query }), res); assert.equal(res.statusCode, 400);
    }
    const res = resposta(); await Privacidade.criar(req({ headers: { 'idempotency-key': 'chave-invalida' }, body: { tipo: 'ACESSO', descricao: 'Quero acessar meus dados' } }), res);
    assert.equal(res.statusCode, 400);
  });
});

test('privacidade: filtro de status/tipo/protocolo é aplicado sem alterar escopo da empresa', async () => {
  await banco(async (sql, args) => {
    assert.match(sql, /status=\$6/); assert.match(sql, /tipo=\$7/); assert.match(sql, /id=\$8/);
    assert.deepEqual(args, [3, false, 7, false, 50, 'EM_ANALISE', 'ACESSO', protocolo]); return { rows: [] };
  }, async () => {
    const res = resposta(); await Privacidade.listar(req({ query: { pagina: '2', status: 'EM_ANALISE', tipo: 'ACESSO', protocolo } }), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.pode_registrar_cliente, false);
  });
});

test('privacidade: reenvio idêntico recupera protocolo e não repete histórico ou limite de criação', async () => {
  await banco(async (sql, args) => {
    if (sql.includes('FROM usuarios')) return { rows: [{ id: 7 }] };
    assert.match(sql, /client_uuid=\$3/); assert.deepEqual(args, [3, 7, protocolo]);
    return { rows: [{ id: protocolo, tipo: 'ACESSO', descricao: 'Quero acessar meus dados', cliente_id: null, status: 'EM_ANALISE' }] };
  }, async () => {
    const res = resposta(); await Privacidade.criar(req({ headers: { 'idempotency-key': protocolo }, body: { tipo: 'ACESSO', descricao: 'Quero acessar meus dados' } }), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.protocolo, protocolo); assert.equal(res.body.ja_registrada, true); assert.equal(res.body.status, 'EM_ANALISE');
  });
});

test('privacidade: chave reaproveitada com outro conteúdo é rejeitada sem gravar', async () => {
  await banco(async sql => {
    if (sql.includes('FROM usuarios')) return { rows: [{ id: 7 }] };
    assert.match(sql, /client_uuid/);
    return { rows: [{ id: protocolo, tipo: 'CORRECAO', descricao: 'Pedido anterior', cliente_id: null }] };
  }, async () => {
    const res = resposta(); await Privacidade.criar(req({ headers: { 'idempotency-key': protocolo }, body: { tipo: 'ACESSO', descricao: 'Quero acessar meus dados' } }), res);
    assert.equal(res.statusCode, 409);
  });
});

test('privacidade: histórico inexistente/sem acesso retorna 404 e não consulta andamentos', async () => {
  for (const u of [usuario, { ...gestor, permissoes: ['GESTAO_GERENCIAR'] }, gestor]) {
    await banco(async (sql, args) => {
      assert.match(sql, /id=\$1 AND empresa_id=\$2/); assert.match(sql, /solicitante_id=\$4/);
      assert.deepEqual(args.slice(0, 2), [protocolo, 3]); assert.equal(args[3], u.usuario_id);
      assert.equal(args[2], u.perfil === 'GESTOR'); assert.equal(args[4], u === gestor);
      return { rows: [] };
    }, async () => {
      const res = resposta(); await Privacidade.detalhes(req({ usuarioLogado: u, params: { id: protocolo } }), res);
      assert.equal(res.statusCode, 404);
    });
  }
});

test('privacidade: histórico é paginado por cursor e não divulga nomes de outros usuários', async () => {
  await banco(async (sql, args) => {
    if (sql.includes('FROM privacidade_solicitacoes WHERE id=')) return { rows: [{ protocolo, tipo: 'ACESSO', status: 'EM_ANALISE' }] };
    assert.match(sql, /s.empresa_id=\$2/); assert.match(sql, /h.id>\$3/); assert.ok(!sql.includes('usuarios'));
    assert.deepEqual(args, [protocolo, 3, 10]);
    return { rows: Array.from({ length: 51 }, (_, i) => ({ id: String(i + 11), status: 'EM_ANALISE', resposta: 'Andamento público do pedido' })) };
  }, async () => {
    const res = resposta(); await Privacidade.detalhes(req({ params: { id: protocolo }, query: { cursor: '10' } }), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.historico.length, 50);
    assert.deepEqual(res.body.paginacao, { tem_mais: true, proximo_cursor: '60' });
    assert.equal(res.body.pode_gerenciar, false);
  });
});
