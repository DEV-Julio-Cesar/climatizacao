const { transacao } = require('../services/OperacaoService');
/**
 * OsController — operações de ciclo de vida principal de uma O.S.
 *
 * Responsabilidades deste arquivo:
 *   criar · atualizarStatus · detalhes · reagendar
 *
 * Os demais grupos de responsabilidade vivem em:
 *   os/OsAgendaController.js   — listarAgenda / listarTodas / listarFinalizadas
 *   os/OsEventoController.js   — registrarEvento / criarRetorno / agendarVisita
 *   os/OsExecucaoController.js — salvarExecucao
 */
const db = require('../config/database');
const OsModel = require('../models/OsModel');
const PushService = require('../services/PushService');
const validarConflito = require('./os/validarConflito');
const logger = require('../config/logger');

const transicoes = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['FINALIZADA', 'CANCELADA'],
  FINALIZADA: [],
  CANCELADA: [],
};

const gestor = (perfil) => ['GESTOR', 'ADMIN'].includes(perfil);

class OsController {
  // ─── Criar ────────────────────────────────────────────────────────────────

  async criar(req, res) {
    const usuario = req.usuarioLogado;
    const tecnicoId =
      gestor(usuario.perfil) && req.body.tecnico_id
        ? req.body.tecnico_id
        : usuario.usuario_id;

    try {
      const novaOs = await transacao(req, async (client) => {
        const relacionamento = await OsModel.validarRelacionamentos(
          {
            empresaId: usuario.empresa_id,
            clienteId: req.body.cliente_id,
            aparelhoId: req.body.aparelho_id,
            tecnicoId,
          },
          client,
        );
        if (!relacionamento.valido)
          throw Object.assign(
            new Error(`Relacionamento inválido: ${relacionamento.campo}`),
            { status: 400 },
          );

        await validarConflito(
          client,
          usuario.empresa_id,
          tecnicoId,
          req.body.agendado_para,
          req.body.duracao_prevista_minutos,
        );

        const os = await OsModel.criar(
          {
            empresaId: usuario.empresa_id,
            clienteId: req.body.cliente_id,
            aparelhoId: req.body.aparelho_id,
            tecnicoId,
            tipoServico: req.body.tipo_servico,
            descricaoProblema: req.body.descricao_problema,
            valorTotal: req.body.valor_total,
            agendadoPara: req.body.agendado_para,
            duracaoPrevistaMinutos: req.body.duracao_prevista_minutos,
          },
          client,
        );

        await OsModel.registrarHistorico(
          {
            osId: os.id,
            statusAnterior: null,
            statusNovo: os.status,
            usuarioId: usuario.usuario_id,
            observacao: 'Ordem de serviço criada',
          },
          client,
        );

        return os;
      });

      if (!req.operacaoRepetida) void PushService.enviar(
        novaOs.tecnico_id,
        'Nova ordem de serviço',
        `A O.S. #${novaOs.id} foi atribuída a você.`,
        { os_id: novaOs.id },
      );

      return res.status(201).json({ mensagem: 'Ordem de serviço criada.', os: novaOs });
    } catch (error) {
      logger.erro('os.criar', { request_id: req.id, erro_mensagem: error.message });
      return res
        .status(error.status || 500)
        .json({ erro: error.status ? error.message : 'Falha ao criar a O.S.' });
    }
  }

  // ─── Detalhes ─────────────────────────────────────────────────────────────

  async detalhes(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ erro: 'ID inválido.' });

    try {
      const os = await OsModel.buscarDetalhes(id, req.usuarioLogado.empresa_id);
      if (!os) return res.status(404).json({ erro: 'O.S. não encontrada.' });
      if (!gestor(req.usuarioLogado.perfil) && os.tecnico_id !== req.usuarioLogado.usuario_id)
        return res.status(403).json({ erro: 'Acesso negado.' });
      return res.json(os);
    } catch (error) {
      logger.erro('os.detalhes', { request_id: req.id, id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao carregar detalhes da O.S.' });
    }
  }

  // ─── Reagendar ────────────────────────────────────────────────────────────

  async reagendar(req, res) {
    if (!gestor(req.usuarioLogado.perfil))
      return res.status(403).json({ erro: 'Acesso restrito a gestores.' });

    const id = Number(req.params.id);

    try {
      await transacao(req, async (client) => {
        const os = await OsModel.buscarPorId(id, req.usuarioLogado.empresa_id, client);
        if (!os) throw Object.assign(new Error('O.S. não encontrada.'), { status: 404 });

        const rel = await OsModel.validarRelacionamentos(
          {
            empresaId: req.usuarioLogado.empresa_id,
            clienteId: os.cliente_id,
            aparelhoId: os.aparelho_id,
            tecnicoId: req.body.tecnico_id,
          },
          client,
        );
        if (!rel.valido)
          throw Object.assign(new Error('Técnico inválido.'), { status: 400 });

        await validarConflito(
          client,
          req.usuarioLogado.empresa_id,
          req.body.tecnico_id,
          req.body.agendado_para,
          req.body.duracao_prevista_minutos,
          id,
        );

        await client.query(
          `UPDATE ordens_servico
              SET tecnico_id=$1, agendado_para=$2, duracao_prevista_minutos=$3, updated_at=NOW()
            WHERE id=$4 AND empresa_id=$5`,
          [
            req.body.tecnico_id,
            req.body.agendado_para,
            req.body.duracao_prevista_minutos,
            id,
            req.usuarioLogado.empresa_id,
          ],
        );

        await OsModel.registrarHistorico(
          {
            osId: id,
            statusAnterior: os.status,
            statusNovo: os.status,
            usuarioId: req.usuarioLogado.usuario_id,
            observacao: `Reagendada para ${req.body.agendado_para}`,
          },
          client,
        );
      });

      if (!req.operacaoRepetida) void PushService.enviar(
        req.body.tecnico_id,
        'Atendimento reagendado',
        `A O.S. #${id} foi incluída na sua agenda.`,
        { os_id: id },
      );

      return res.json({ mensagem: 'O.S. reagendada.' });
    } catch (error) {
      return res
        .status(error.status || 500)
        .json({ erro: error.status ? error.message : 'Falha ao reagendar.' });
    }
  }

  // ─── Atualizar status (inclui finalização com PDF + estoque) ─────────────

  async atualizarStatus(req, res) {
    const id = Number(req.params.id);
    const { novo_status: novoStatus } = req.body;
    const usuario = req.usuarioLogado;

    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ erro: 'ID inválido.' });

    try {
      const atualizada = await transacao(req, async (client) => {
        // Bug 9 — SELECT FOR UPDATE serializa transações simultâneas na mesma OS.
        // A segunda requisição PATCH /os/:id/status fica bloqueada até a primeira
        // commitar, garantindo que a checagem de estado seja atômica.
        const lockResult = await client.query(
          'SELECT * FROM ordens_servico WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL FOR UPDATE',
          [id, usuario.empresa_id],
        );
        const os = lockResult.rows[0];
        if (!os)
          throw Object.assign(new Error('O.S. não encontrada ou acesso negado.'), { status: 404 });
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id)
          throw Object.assign(new Error('Acesso negado a esta O.S.'), { status: 403 });
        if (!transicoes[os.status]?.includes(novoStatus))
          throw Object.assign(
            new Error(`Transição de ${os.status} para ${novoStatus} não permitida.`),
            { status: 409 },
          );

        if (novoStatus === 'FINALIZADA') {
          await _validarPreRequisitosFinalizacao(client, id, os, usuario);
          await require('../services/EstoqueService').baixar(client, id, os, usuario);
          await client.query('INSERT INTO fila_documentos(os_id,empresa_id) VALUES($1,$2) ON CONFLICT(os_id) DO NOTHING', [id, usuario.empresa_id]);
        }

        const result = await client.query(
          `UPDATE ordens_servico
              SET status = $1::varchar,
                  finalizado_em   = CASE WHEN $1::varchar = 'FINALIZADA'   THEN NOW() ELSE finalizado_em   END,
                  iniciado_em     = CASE WHEN $1::varchar = 'EM_ANDAMENTO' THEN COALESCE(iniciado_em, NOW()) ELSE iniciado_em END,
                  updated_at = NOW()
            WHERE id = $2 AND empresa_id = $3
            RETURNING *`,
          [novoStatus, id, usuario.empresa_id],
        );

        await OsModel.registrarHistorico(
          { osId: id, statusAnterior: os.status, statusNovo: novoStatus, usuarioId: usuario.usuario_id },
          client,
        );

        return result.rows[0];
      });

      // Documento processado pelo worker apos o commit.

      return res.json({
        mensagem: `O.S. atualizada para ${novoStatus}.`,
        os: atualizada,
        pdf_url: atualizada.pdf_url || null,
      });
    } catch (error) {
      logger.erro('os.atualizarStatus', { request_id: req.id, os_id: id, erro_mensagem: error.message });
      return res
        .status(error.status || 500)
        .json({ erro: error.status ? error.message : 'Falha ao atualizar a O.S.' });
    }
  }
}

// ─── Funções auxiliares privadas ─────────────────────────────────────────────

async function _validarPreRequisitosFinalizacao(client, id, os, usuario) {
  if (!os.diagnostico || !os.solucao_aplicada)
    throw Object.assign(
      new Error('Preencha o relatório técnico antes de finalizar.'),
      { status: 422 },
    );

  const assinatura = await client.query(
    "SELECT id FROM os_fotos WHERE os_id=$1 AND tipo='ASSINATURA' LIMIT 1",
    [id],
  );
  if (!assinatura.rows[0])
    throw Object.assign(
      new Error('Colete a assinatura do cliente antes de finalizar.'),
      { status: 422 },
    );

  const evidencias = await client.query(
    "SELECT COUNT(*)::int total FROM os_fotos WHERE os_id=$1 AND tipo IN ('ANTES','DEPOIS','EVIDENCIA')",
    [id],
  );
  if (evidencias.rows[0].total < 2)
    throw Object.assign(
      new Error('Registre pelo menos duas fotos do atendimento antes de finalizar.'),
      { status: 422 },
    );

  const checklist = await client.query(
    'SELECT id FROM os_checklist_respostas WHERE os_id=$1 LIMIT 1',
    [id],
  );
  if (!checklist.rows[0])
    throw Object.assign(new Error('Preencha o checklist antes de finalizar.'), { status: 422 });

  if (!os.checkout_em)
    throw Object.assign(
      new Error('Realize o check-out com GPS antes de finalizar.'),
      { status: 422 },
    );
}


module.exports = new OsController();
