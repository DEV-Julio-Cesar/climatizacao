const OsModel = require('../../models/OsModel');
const logger = require('../../config/logger');

/**
 * Rotas de leitura/listagem de O.S.
 * GET /os/agenda  · GET /os/todas  · GET /os/finalizadas
 */
class OsAgendaController {
  async listarAgenda(req, res) {
    const FILTROS_VALIDOS = ['HOJE', 'ATRASADAS', 'PROXIMAS', 'TODAS'];
    const filtro = String(req.query.filtro || 'HOJE').toUpperCase();
    if (!FILTROS_VALIDOS.includes(filtro))
      return res.status(400).json({ erro: 'Filtro de agenda inválido.' });

    const busca =
      typeof req.query.busca === 'string' ? req.query.busca.trim().slice(0, 100) : '';

    try {
      const agenda = await OsModel.listarAgenda(
        req.usuarioLogado.usuario_id,
        req.usuarioLogado.empresa_id,
        filtro,
        busca,
      );
      return res.json(agenda);
    } catch (error) {
      logger.erro('os.agenda', { request_id: req.id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao buscar a agenda.' });
    }
  }

  async listarTodas(req, res) {
    const paginacao = lerPaginacao(req.query);
    if (paginacao.erro) return res.status(400).json({ erro: paginacao.erro });
    const filtros = lerFiltros(req.query);
    if (filtros.erro) return res.status(400).json({ erro: filtros.erro });
    try {
      return res.json(await OsModel.listarTodas(req.usuarioLogado.empresa_id, paginacao.valor, filtros.valor));
    } catch {
      return res.status(500).json({ erro: 'Falha ao listar ordens de serviço.' });
    }
  }

  async listarFinalizadas(req, res) {
    const busca =
      typeof req.query.busca === 'string' ? req.query.busca.slice(0, 100) : '';
    const paginacao = lerPaginacao(req.query);
    if (paginacao.erro) return res.status(400).json({ erro: paginacao.erro });
    try {
      return res.json(
        await OsModel.listarFinalizadas(req.usuarioLogado.empresa_id, busca, paginacao.valor),
      );
    } catch (error) {
      logger.erro('os.finalizadas', { request_id: req.id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao listar ordens finalizadas.' });
    }
  }
}

function lerFiltros(query) {
  const status = String(query.status || '').toUpperCase();
  const validos = ['', 'ATIVAS', 'ABERTA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA'];
  if (!validos.includes(status)) return { erro: 'status inválido.' };
  const busca = typeof query.busca === 'string' ? query.busca.trim().slice(0, 100) : '';
  return { valor: { status, busca } };
}

function lerPaginacao(query) {
  if (query.limit === undefined && query.cursor === undefined) return { valor: null };
  const limit = Number(query.limit || 50);
  const cursor = query.cursor === undefined || query.cursor === '' ? null : Number(query.cursor);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    return { erro: 'limit deve ser um inteiro entre 1 e 100.' };
  if (cursor !== null && (!Number.isInteger(cursor) || cursor <= 0))
    return { erro: 'cursor inválido.' };
  return { valor: { limit, cursor } };
}

module.exports = new OsAgendaController();
