const db = require('../config/database');
const OsModel = require('../models/OsModel');
const PdfService = require('../services/PdfService');
const WhatsAppService = require('../services/WhatsAppService');

const transicoes = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['FINALIZADA', 'CANCELADA'],
  FINALIZADA: [],
  CANCELADA: [],
};

const gestor = (perfil) => ['GESTOR', 'ADMIN'].includes(perfil);

class OsController {
  async criar(req, res) {
    const usuario = req.usuarioLogado;
    const tecnicoId = gestor(usuario.perfil) && req.body.tecnico_id
      ? req.body.tecnico_id
      : usuario.usuario_id;

    try {
      const novaOs = await db.transaction(async (client) => {
        const relacionamento = await OsModel.validarRelacionamentos({
          empresaId: usuario.empresa_id,
          clienteId: req.body.cliente_id,
          aparelhoId: req.body.aparelho_id,
          tecnicoId,
        }, client);
        if (!relacionamento.valido) {
          const error = new Error(`Relacionamento inválido: ${relacionamento.campo}`);
          error.status = 400;
          throw error;
        }

        const os = await OsModel.criar({
          empresaId: usuario.empresa_id,
          clienteId: req.body.cliente_id,
          aparelhoId: req.body.aparelho_id,
          tecnicoId,
          tipoServico: req.body.tipo_servico,
          descricaoProblema: req.body.descricao_problema,
          valorTotal: req.body.valor_total,
          agendadoPara: req.body.agendado_para,
        }, client);
        await OsModel.registrarHistorico({
          osId: os.id,
          statusAnterior: null,
          statusNovo: os.status,
          usuarioId: usuario.usuario_id,
          observacao: 'Ordem de serviço criada',
        }, client);
        return os;
      });
      return res.status(201).json({ mensagem: 'Ordem de serviço criada.', os: novaOs });
    } catch (error) {
      console.error('Erro ao criar O.S.:', error.message);
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao criar a O.S.' });
    }
  }

  async atualizarStatus(req, res) {
    const id = Number(req.params.id);
    const { novo_status: novoStatus } = req.body;
    const usuario = req.usuarioLogado;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });

    try {
      const atualizada = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os) {
          const error = new Error('O.S. não encontrada ou acesso negado.');
          error.status = 404;
          throw error;
        }
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id) {
          const error = new Error('Acesso negado a esta O.S.');
          error.status = 403;
          throw error;
        }
        if (!transicoes[os.status]?.includes(novoStatus)) {
          const error = new Error(`Transição de ${os.status} para ${novoStatus} não permitida.`);
          error.status = 409;
          throw error;
        }
        if (novoStatus === 'FINALIZADA') {
          if (!os.diagnostico || !os.solucao_aplicada) {
            const error = new Error('Preencha o relatório técnico antes de finalizar.');
            error.status = 422; throw error;
          }
          const assinatura = await client.query("SELECT id FROM os_fotos WHERE os_id=$1 AND tipo='ASSINATURA' LIMIT 1", [id]);
          if (!assinatura.rows[0]) {
            const error = new Error('Colete a assinatura do cliente antes de finalizar.');
            error.status = 422; throw error;
          }
          const itensEstoque = await client.query(
            `SELECT oi.id, oi.referencia_id, oi.quantidade, p.nome, p.estoque
             FROM os_itens oi
             JOIN produtos p ON p.id=oi.referencia_id AND p.empresa_id=$2
             WHERE oi.os_id=$1 AND oi.tipo='PECA' AND oi.estoque_baixado=FALSE
             FOR UPDATE OF p`, [id, usuario.empresa_id]);
          for (const item of itensEstoque.rows) {
            const quantidade = Number(item.quantidade);
            if (Number(item.estoque) < quantidade) {
              const error = new Error(`Estoque insuficiente para ${item.nome}. Disponível: ${item.estoque}.`);
              error.status = 422; throw error;
            }
            await client.query('UPDATE produtos SET estoque=estoque-$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3',
              [quantidade, item.referencia_id, usuario.empresa_id]);
            await client.query(
              `INSERT INTO estoque_movimentos (empresa_id,produto_id,tipo,quantidade,observacao,os_id,usuario_id)
               VALUES ($1,$2,'SAIDA',$3,$4,$5,$6)`,
              [usuario.empresa_id, item.referencia_id, quantidade, `Baixa automática da O.S. #${id}`, id, usuario.usuario_id]);
            await client.query('UPDATE os_itens SET estoque_baixado=TRUE WHERE id=$1', [item.id]);
          }
        }
        const result = await client.query(
          `UPDATE ordens_servico SET status = $1::varchar,
             finalizado_em = CASE WHEN $1::varchar = 'FINALIZADA' THEN NOW() ELSE finalizado_em END,
             iniciado_em = CASE WHEN $1::varchar = 'EM_ANDAMENTO' THEN COALESCE(iniciado_em, NOW()) ELSE iniciado_em END,
             updated_at = NOW()
           WHERE id = $2 AND empresa_id = $3 RETURNING *`,
          [novoStatus, id, usuario.empresa_id]
        );
        await OsModel.registrarHistorico({
          osId: id, statusAnterior: os.status, statusNovo: novoStatus,
          usuarioId: usuario.usuario_id,
        }, client);
        return result.rows[0];
      });

      let pdfUrl = null;
      if (novoStatus === 'FINALIZADA') {
        const dados = await OsModel.buscarDadosCompletosParaPdf(id, usuario.empresa_id);
        const [fotos, checklist, medicoes, itens] = await Promise.all([db.query(
          `SELECT tipo, url FROM os_fotos f JOIN ordens_servico os ON os.id = f.os_id
           WHERE f.os_id = $1 AND os.empresa_id = $2 ORDER BY f.created_at`,
          [id, usuario.empresa_id]
        ), db.query('SELECT item,conforme,observacao FROM os_checklist_respostas WHERE os_id=$1 ORDER BY id', [id]),
        db.query('SELECT * FROM os_medicoes WHERE os_id=$1', [id]),
        db.query('SELECT tipo,descricao,quantidade,valor_unitario FROM os_itens WHERE os_id=$1 ORDER BY id', [id])]);
        dados.checklist = checklist.rows; dados.medicoes = medicoes.rows[0] || {}; dados.itens = itens.rows;
        pdfUrl = await PdfService.gerarOsPdf(dados, fotos.rows);
        await db.query('UPDATE ordens_servico SET pdf_url = $1 WHERE id = $2 AND empresa_id = $3',
          [pdfUrl, id, usuario.empresa_id]);
        if (dados.telefone_whatsapp && WhatsAppService.configurado()) {
          void WhatsAppService.enviarPdfOs(dados.telefone_whatsapp, dados.cliente_nome, pdfUrl);
        }
      }
      return res.json({ mensagem: `O.S. atualizada para ${novoStatus}.`, os: atualizada, pdf_url: pdfUrl });
    } catch (error) {
      console.error('Erro ao atualizar O.S.:', error.message);
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao atualizar a O.S.' });
    }
  }

  async listarAgenda(req, res) {
    try {
      const agenda = await OsModel.listarAgenda(req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id);
      return res.json(agenda);
    } catch (error) {
      console.error('Erro ao listar agenda:', error.message);
      return res.status(500).json({ erro: 'Falha ao buscar a agenda.' });
    }
  }

  async detalhes(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
    try {
      const os = await OsModel.buscarDetalhes(id, req.usuarioLogado.empresa_id);
      if (!os) return res.status(404).json({ erro: 'O.S. não encontrada.' });
      if (!gestor(req.usuarioLogado.perfil) && os.tecnico_id !== req.usuarioLogado.usuario_id) return res.status(403).json({ erro: 'Acesso negado.' });
      return res.json(os);
    } catch (error) {
      console.error('Erro ao detalhar O.S.:', error.message);
      return res.status(500).json({ erro: 'Falha ao carregar detalhes da O.S.' });
    }
  }

  async salvarExecucao(req, res) {
    const id = Number(req.params.id); const usuario = req.usuarioLogado;
    try {
      const total = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os) { const e = new Error('O.S. não encontrada.'); e.status = 404; throw e; }
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id) { const e = new Error('Acesso negado.'); e.status = 403; throw e; }
        if (os.status !== 'EM_ANDAMENTO') { const e = new Error('A O.S. precisa estar em andamento.'); e.status = 409; throw e; }
        const valor = await OsModel.salvarExecucao(id, usuario.empresa_id, req.body, client);
        await OsModel.registrarHistorico({ osId: id, statusAnterior: os.status, statusNovo: os.status,
          usuarioId: usuario.usuario_id, observacao: 'Relatório técnico atualizado' }, client);
        return valor;
      });
      return res.json({ mensagem: 'Relatório técnico salvo.', valor_total: total });
    } catch (error) {
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao salvar relatório técnico.' });
    }
  }

  async listarTodas(req, res) {
    try {
      return res.json(await OsModel.listarTodas(req.usuarioLogado.empresa_id));
    } catch (error) {
      return res.status(500).json({ erro: 'Falha ao listar ordens de serviço.' });
    }
  }

  async listarFinalizadas(req, res) {
    try {
      const busca = typeof req.query.busca === 'string' ? req.query.busca.slice(0, 100) : '';
      return res.json(await OsModel.listarFinalizadas(req.usuarioLogado.empresa_id, busca));
    } catch (error) {
      console.error('Erro ao listar O.S. finalizadas:', error.message);
      return res.status(500).json({ erro: 'Falha ao listar ordens finalizadas.' });
    }
  }

  async reagendar(req, res) {
    if (!gestor(req.usuarioLogado.perfil)) return res.status(403).json({ erro: 'Acesso restrito a gestores.' });
    const id = Number(req.params.id);
    try {
      await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, req.usuarioLogado.empresa_id, client);
        if (!os) {
          const error = new Error('O.S. não encontrada.'); error.status = 404; throw error;
        }
        const rel = await OsModel.validarRelacionamentos({
          empresaId: req.usuarioLogado.empresa_id, clienteId: os.cliente_id,
          aparelhoId: os.aparelho_id, tecnicoId: req.body.tecnico_id,
        }, client);
        if (!rel.valido) { const error = new Error('Técnico inválido.'); error.status = 400; throw error; }
        await client.query(
          'UPDATE ordens_servico SET tecnico_id = $1, agendado_para = $2, updated_at = NOW() WHERE id = $3 AND empresa_id = $4',
          [req.body.tecnico_id, req.body.agendado_para, id, req.usuarioLogado.empresa_id]
        );
        await OsModel.registrarHistorico({ osId: id, statusAnterior: os.status, statusNovo: os.status,
          usuarioId: req.usuarioLogado.usuario_id, observacao: `Reagendada para ${req.body.agendado_para}` }, client);
      });
      return res.json({ mensagem: 'O.S. reagendada.' });
    } catch (error) {
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao reagendar.' });
    }
  }
}

module.exports = new OsController();
