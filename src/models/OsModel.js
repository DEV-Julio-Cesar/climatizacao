const db = require('../config/database');

class OsModel {
  async validarRelacionamentos({ empresaId, clienteId, aparelhoId, tecnicoId }, executor = db) {
    const cliente = await executor.query(
      'SELECT id FROM clientes WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL',
      [clienteId, empresaId]
    );
    if (!cliente.rows[0]) return { valido: false, campo: 'cliente_id' };

    const tecnico = await executor.query(
      "SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo = TRUE AND deleted_at IS NULL AND perfil IN ('TECNICO', 'GESTOR', 'ADMIN')",
      [tecnicoId, empresaId]
    );
    if (!tecnico.rows[0]) return { valido: false, campo: 'tecnico_id' };

    if (aparelhoId) {
      const aparelho = await executor.query(
        'SELECT id FROM aparelhos WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3 AND deleted_at IS NULL',
        [aparelhoId, clienteId, empresaId]
      );
      if (!aparelho.rows[0]) return { valido: false, campo: 'aparelho_id' };
    }
    return { valido: true };
  }

  async criar(dados, executor = db) {
    const result = await executor.query(
      `INSERT INTO ordens_servico
       (empresa_id, cliente_id, aparelho_id, tecnico_id, tipo_servico, descricao_problema, valor_total, agendado_para)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [dados.empresaId, dados.clienteId, dados.aparelhoId || null, dados.tecnicoId,
        dados.tipoServico, dados.descricaoProblema, dados.valorTotal || 0, dados.agendadoPara || null]
    );
    return result.rows[0];
  }

  async buscarPorId(id, empresaId, executor = db) {
    const result = await executor.query(
      'SELECT * FROM ordens_servico WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL',
      [id, empresaId]
    );
    return result.rows[0];
  }

  async buscarDetalhes(id, empresaId) {
    const principal = await db.query(
      `SELECT os.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.endereco AS cliente_endereco,
              c.latitude, c.longitude, u.nome AS tecnico_nome, a.marca AS aparelho_marca,
              a.modelo AS aparelho_modelo, a.capacidade AS aparelho_capacidade
       FROM ordens_servico os
       JOIN clientes c ON c.id=os.cliente_id AND c.empresa_id=os.empresa_id
       JOIN usuarios u ON u.id=os.tecnico_id AND u.empresa_id=os.empresa_id
       LEFT JOIN aparelhos a ON a.id=os.aparelho_id
       WHERE os.id=$1 AND os.empresa_id=$2 AND os.deleted_at IS NULL`, [id, empresaId]);
    const os = principal.rows[0];
    if (!os) return null;
    const [historico, checklist, medicoes, itens, fotos] = await Promise.all([
      os.aparelho_id ? db.query(
        `SELECT id,tipo_servico,diagnostico,solucao_aplicada,finalizado_em FROM ordens_servico
         WHERE aparelho_id=$1 AND empresa_id=$2 AND id<>$3 AND status='FINALIZADA' AND deleted_at IS NULL
         ORDER BY finalizado_em DESC LIMIT 10`, [os.aparelho_id, empresaId, id]) : { rows: [] },
      db.query('SELECT item,conforme,observacao FROM os_checklist_respostas WHERE os_id=$1 ORDER BY id', [id]),
      db.query('SELECT * FROM os_medicoes WHERE os_id=$1', [id]),
      db.query('SELECT tipo,referencia_id,descricao,quantidade,valor_unitario FROM os_itens WHERE os_id=$1 ORDER BY id', [id]),
      db.query('SELECT tipo,url FROM os_fotos WHERE os_id=$1 ORDER BY created_at', [id]),
    ]);
    return { ...os, historico_equipamento: historico.rows, checklist: checklist.rows,
      medicoes: medicoes.rows[0] || null, itens: itens.rows, fotos: fotos.rows };
  }

  async salvarExecucao(id, empresaId, dados, executor) {
    const total = dados.itens.reduce((s, item) => s + item.quantidade * item.valor_unitario, 0);
    await executor.query(
      `UPDATE ordens_servico SET diagnostico=$1,solucao_aplicada=$2,recomendacoes=$3,
       garantia_dias=$4,retorno_necessario=$5,valor_total=$6,updated_at=NOW() WHERE id=$7 AND empresa_id=$8`,
      [dados.diagnostico, dados.solucao_aplicada, dados.recomendacoes || null, dados.garantia_dias,
        dados.retorno_necessario, total, id, empresaId]);
    await executor.query('DELETE FROM os_checklist_respostas WHERE os_id=$1', [id]);
    for (const r of dados.checklist) await executor.query(
      'INSERT INTO os_checklist_respostas (os_id,item,conforme,observacao) VALUES ($1,$2,$3,$4)',
      [id, r.item, r.conforme, r.observacao || null]);
    const m = dados.medicoes;
    await executor.query(
      `INSERT INTO os_medicoes (os_id,temperatura_retorno,temperatura_insuflamento,tensao,corrente,pressao_baixa,pressao_alta,umidade,tipo_gas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (os_id) DO UPDATE SET
       temperatura_retorno=EXCLUDED.temperatura_retorno,temperatura_insuflamento=EXCLUDED.temperatura_insuflamento,
       tensao=EXCLUDED.tensao,corrente=EXCLUDED.corrente,pressao_baixa=EXCLUDED.pressao_baixa,
       pressao_alta=EXCLUDED.pressao_alta,umidade=EXCLUDED.umidade,tipo_gas=EXCLUDED.tipo_gas,updated_at=NOW()`,
      [id, m.temperatura_retorno || null, m.temperatura_insuflamento || null, m.tensao || null,
        m.corrente || null, m.pressao_baixa || null, m.pressao_alta || null, m.umidade || null, m.tipo_gas || null]);
    await executor.query('DELETE FROM os_itens WHERE os_id=$1', [id]);
    for (const item of dados.itens) await executor.query(
      'INSERT INTO os_itens (os_id,tipo,referencia_id,descricao,quantidade,valor_unitario) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, item.tipo, item.referencia_id || null, item.descricao, item.quantidade, item.valor_unitario]);
    return total;
  }

  async registrarHistorico({ osId, statusAnterior, statusNovo, usuarioId, observacao }, executor = db) {
    await executor.query(
      `INSERT INTO os_historico (os_id, status_anterior, status_novo, modificado_por, observacao)
       VALUES ($1, $2, $3, $4, $5)`,
      [osId, statusAnterior, statusNovo, usuarioId, observacao || null]
    );
  }

  async listarAgenda(tecnicoId, empresaId) {
    const result = await db.query(
      `SELECT os.id, os.tipo_servico, os.descricao_problema, os.status, os.agendado_para,
              c.nome AS cliente_nome, c.endereco, c.latitude, c.longitude
       FROM ordens_servico os
       JOIN clientes c ON c.id = os.cliente_id AND c.empresa_id = os.empresa_id
       WHERE os.tecnico_id = $1 AND os.empresa_id = $2
         AND os.status IN ('ABERTA', 'EM_ANDAMENTO') AND os.deleted_at IS NULL
       ORDER BY os.agendado_para NULLS LAST, os.created_at`,
      [tecnicoId, empresaId]
    );
    return result.rows;
  }

  async listarTodas(empresaId) {
    const result = await db.query(
      `SELECT os.*, c.nome AS cliente_nome, u.nome AS tecnico_nome
       FROM ordens_servico os
       JOIN clientes c ON c.id = os.cliente_id
       JOIN usuarios u ON u.id = os.tecnico_id
       WHERE os.empresa_id = $1 AND os.deleted_at IS NULL
       ORDER BY os.agendado_para NULLS LAST, os.created_at DESC`,
      [empresaId]
    );
    return result.rows;
  }

  async listarFinalizadas(empresaId, busca = '') {
    const termo = `%${busca.trim()}%`;
    const result = await db.query(
      `SELECT os.id, os.tipo_servico, os.descricao_problema, os.valor_total,
              os.finalizado_em, os.pdf_url, c.nome AS cliente_nome,
              c.telefone AS cliente_telefone, u.nome AS tecnico_nome,
              COUNT(f.id)::int AS total_anexos,
              COALESCE((SELECT SUM(p.valor) FROM pagamentos p WHERE p.os_id=os.id),0) AS total_pago,
              GREATEST(os.valor_total-COALESCE((SELECT SUM(p.valor) FROM pagamentos p WHERE p.os_id=os.id),0),0) AS saldo_pendente
       FROM ordens_servico os
       JOIN clientes c ON c.id = os.cliente_id AND c.empresa_id = os.empresa_id
       JOIN usuarios u ON u.id = os.tecnico_id AND u.empresa_id = os.empresa_id
       LEFT JOIN os_fotos f ON f.os_id = os.id
       WHERE os.empresa_id = $1 AND os.status = 'FINALIZADA' AND os.deleted_at IS NULL
         AND ($2 = '%%' OR c.nome ILIKE $2 OR os.id::text ILIKE $2)
       GROUP BY os.id, c.id, u.id
       ORDER BY os.finalizado_em DESC
       LIMIT 200`,
      [empresaId, termo]
    );
    return result.rows;
  }

  async buscarDadosCompletosParaPdf(id, empresaId) {
    const result = await db.query(
      `SELECT os.*, c.nome AS cliente_nome, c.telefone AS telefone_whatsapp,
              c.endereco AS cliente_endereco, e.nome AS empresa_nome, u.nome AS tecnico_nome
       FROM ordens_servico os
       JOIN clientes c ON c.id = os.cliente_id AND c.empresa_id = os.empresa_id
       JOIN empresas e ON e.id = os.empresa_id
       JOIN usuarios u ON u.id = os.tecnico_id
       WHERE os.id = $1 AND os.empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0];
  }
}

module.exports = new OsModel();
