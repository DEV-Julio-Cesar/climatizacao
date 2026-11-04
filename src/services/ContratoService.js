const db = require('../config/database');
const validarConflito = require('../controllers/os/validarConflito');
const erro = (mensagem, status) => Object.assign(new Error(mensagem), { status });

async function gerarVisitas(id, usuario, dados) {
  return db.transaction(async client => {
    const resultado = await client.query("SELECT *,to_char(proxima_visita,'YYYY-MM-DD') competencia FROM contratos WHERE id=$1 AND empresa_id=$2 AND status='ATIVO' FOR UPDATE", [id, usuario.empresa_id]);
    const contrato = resultado.rows[0];
    if (!contrato) throw erro('Contrato ativo não encontrado.', 404);
    if (dados.competencia !== contrato.competencia) throw erro('A próxima visita mudou. Atualize a lista antes de gerar novamente.', 409);
    const tecnico = await client.query("SELECT id FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL AND perfil='TECNICO'", [dados.tecnico_id, usuario.empresa_id]);
    if (!tecnico.rows.length) throw erro('Técnico inválido.', 400);
    const cliente = await client.query('SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL', [contrato.cliente_id, usuario.empresa_id]);
    if (!cliente.rows.length) throw erro('Cliente inativo.', 409);
    const aparelhos = await client.query('SELECT a.id FROM contrato_aparelhos ca JOIN aparelhos a ON a.id=ca.aparelho_id WHERE ca.contrato_id=$1 AND a.empresa_id=$2 AND a.cliente_id=$3 AND a.deleted_at IS NULL ORDER BY a.id', [id, usuario.empresa_id, contrato.cliente_id]);
    const ordens = [];
    // Uma OS por aparelho, em horários consecutivos; contrato sem aparelho gera uma visita geral.
    for (const [indice, aparelho] of (aparelhos.rows.length ? aparelhos.rows : [{ id: null }]).entries()) {
      const inicio = new Date(Date.parse(dados.agendado_para) + indice * dados.duracao_prevista_minutos * 60000).toISOString();
      await validarConflito(client, usuario.empresa_id, dados.tecnico_id, inicio, dados.duracao_prevista_minutos);
      const ordem = await client.query(`INSERT INTO ordens_servico(empresa_id,cliente_id,aparelho_id,tecnico_id,tipo_servico,descricao_problema,agendado_para,duracao_prevista_minutos)
        VALUES($1,$2,$3,$4,'PREVENTIVA',$5,$6,$7) RETURNING *`, [usuario.empresa_id, contrato.cliente_id, aparelho.id, dados.tecnico_id, `Manutenção preventiva - ${contrato.nome} (contrato #${id})`, inicio, dados.duracao_prevista_minutos]);
      await client.query("INSERT INTO os_historico(os_id,status_anterior,status_novo,modificado_por,observacao) VALUES($1,NULL,'ABERTA',$2,$3)", [ordem.rows[0].id, usuario.usuario_id, `Gerada pelo contrato #${id}`]);
      ordens.push(ordem.rows[0]);
    }
    await client.query("UPDATE contratos SET proxima_visita=(proxima_visita+(periodicidade_meses||' months')::interval)::date,updated_at=NOW() WHERE id=$1 AND empresa_id=$2", [id, usuario.empresa_id]);
    return { id: ordens[0].id, ordens };
  });
}
module.exports = { gerarVisitas };
