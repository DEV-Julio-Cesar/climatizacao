const service = require('../services/RelatorioService');
const falha = (res, e) => res.status(e.status || 500).json({ erro: e.status ? e.message : 'Falha ao gerar relatório.' });
module.exports = {
  async gerencial(req, res) {
    try { return res.json(await service.gerencial(req.usuarioLogado.empresa_id, service.filtros(req.query))); } catch(e) { return falha(res,e); }
  },
  async pendentes(req, res) {
    try { return res.json(await service.ordens(req.usuarioLogado.empresa_id, service.filtros(req.query), true)); } catch(e) { return falha(res,e); }
  },
  async exportar(req, res) {
    try {
      const dados = await service.ordens(req.usuarioLogado.empresa_id, service.filtros(req.query));
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ordens-servico.csv"', 'Cache-Control': 'no-store' });
      return res.send(service.csv(dados));
    } catch(e) { return falha(res,e); }
  },
};
