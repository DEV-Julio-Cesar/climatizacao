const r=require('express').Router(),auth=require('../middlewares/authMiddleware'),c=require('../controllers/FinanceiroController');r.use(auth);
r.get('/catalogo',c.catalogo);r.post('/catalogo',c.criarCatalogo);r.post('/produtos/:id/movimentar',c.movimentar);
r.get('/orcamentos',c.listarOrcamentos);r.post('/orcamentos',c.criarOrcamento);r.get('/orcamentos/:id',c.detalheOrcamento);r.patch('/orcamentos/:id/status',c.statusOrcamento);r.post('/orcamentos/:id/converter',c.converter);
r.post('/os/:id/pagamentos',c.registrarPagamento);r.get('/financeiro/dashboard',c.dashboard);module.exports=r;
