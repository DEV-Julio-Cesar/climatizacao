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
    try {
      return res.json(await OsModel.listarTodas(req.usuarioLogado.empresa_id));
    } catch {
      return res.status(500).json({ erro: 'Falha ao listar ordens de serviço.' });
    }
  }

  async listarFinalizadas(req, res) {
    const busca =
      typeof req.query.busca === 'string' ? req.query.busca.slice(0, 100) : '';
    try {
      return res.json(
        await OsModel.listarFinalizadas(req.usuarioLogado.empresa_id, busca),
      );
    } catch (error) {
      logger.erro('os.finalizadas', { request_id: req.id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao listar ordens finalizadas.' });
    }
  }
}

module.exports = new OsAgendaController();
