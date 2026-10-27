const db = require('../../config/database');
const OsModel = require('../../models/OsModel');

const gestor = (perfil) => ['GESTOR', 'ADMIN'].includes(perfil);

/**
 * Salva o relatório técnico (checklist + medições + itens) de uma O.S. em andamento.
 * PATCH /os/:id/execucao
 */
class OsExecucaoController {
  async salvarExecucao(req, res) {
    const id = Number(req.params.id);
    const usuario = req.usuarioLogado;

    try {
      const total = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os) throw Object.assign(new Error('O.S. não encontrada.'), { status: 404 });
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id)
          throw Object.assign(new Error('Acesso negado.'), { status: 403 });
        if (os.status !== 'EM_ANDAMENTO')
          throw Object.assign(new Error('A O.S. precisa estar em andamento.'), { status: 409 });

        // Exige pelo menos 2 fotos antes de salvar relatório
        const fotos = await client.query(
          "SELECT COUNT(*)::int total FROM os_fotos WHERE os_id=$1 AND tipo IN ('ANTES','DEPOIS','EVIDENCIA')",
          [id],
        );
        if (fotos.rows[0].total < 2)
          throw Object.assign(
            new Error('Registre pelo menos duas fotos do atendimento antes do relatório.'),
            { status: 422 },
          );

        // Valida checklist conforme modelo configurado para o tipo de serviço
        const regras = await client.query(
          `SELECT item,obrigatorio,exige_observacao_nao_conforme,exige_foto,
                  medicao_campo,valor_minimo,valor_maximo
             FROM checklist_modelos
            WHERE tipo_servico=$1 AND ativo=TRUE
              AND (empresa_id=$2 OR (
                    empresa_id IS NULL AND NOT EXISTS(
                      SELECT 1 FROM checklist_modelos x
                       WHERE x.empresa_id=$2 AND x.tipo_servico=$1 AND x.ativo=TRUE
                    )
                  ))`,
          [os.tipo_servico, usuario.empresa_id],
        );

        for (const regra of regras.rows) {
          const resposta = req.body.checklist?.find((x) => x.item === regra.item);

          if (regra.obrigatorio && !resposta)
            throw Object.assign(new Error(`Responda o item: ${regra.item}.`), { status: 422 });

          if (resposta?.conforme === false && regra.exige_observacao_nao_conforme && !resposta.observacao)
            throw Object.assign(
              new Error(`Descreva a não conformidade: ${regra.item}.`),
              { status: 422 },
            );

          if (regra.exige_foto && fotos.rows[0].total < 1)
            throw Object.assign(
              new Error(`O item ${regra.item} exige evidência fotográfica.`),
              { status: 422 },
            );

          if (regra.medicao_campo) {
            const valor = Number(req.body.medicoes?.[regra.medicao_campo]);
            if (
              Number.isFinite(valor) &&
              ((regra.valor_minimo !== null && valor < Number(regra.valor_minimo)) ||
                (regra.valor_maximo !== null && valor > Number(regra.valor_maximo)))
            )
              throw Object.assign(
                new Error(`${regra.item}: medição fora da faixa configurada.`),
                { status: 422 },
              );
          }
        }

        const valor = await OsModel.salvarExecucao(
          id,
          usuario.empresa_id,
          req.body,
          client,
        );

        await OsModel.registrarHistorico(
          {
            osId: id,
            statusAnterior: os.status,
            statusNovo: os.status,
            usuarioId: usuario.usuario_id,
            observacao: 'Relatório técnico atualizado',
          },
          client,
        );

        return valor;
      });

      return res.json({ mensagem: 'Relatório técnico salvo.', valor_total: total });
    } catch (error) {
      return res
        .status(error.status || 500)
        .json({ erro: error.status ? error.message : 'Falha ao salvar relatório técnico.' });
    }
  }
}

module.exports = new OsExecucaoController();
