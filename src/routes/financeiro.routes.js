const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const permitir = require('../middlewares/permissaoMiddleware');
const controller = require('../controllers/FinanceiroController');
const catalogo = require('../controllers/CatalogoController');

router.use(auth);
router.get('/catalogo', permitir('ESTOQUE_VISUALIZAR'), controller.catalogo);
router.post('/catalogo', permitir('ESTOQUE_GERENCIAR'), controller.criarCatalogo);
router.patch('/catalogo/servicos/:id', permitir('ESTOQUE_GERENCIAR'), catalogo.atualizarServico);
router.delete('/catalogo/servicos/:id', permitir('ESTOQUE_GERENCIAR'), catalogo.inativarServico);
router.patch('/catalogo/produtos/:id', permitir('ESTOQUE_GERENCIAR'), catalogo.atualizarProduto);
router.delete('/catalogo/produtos/:id', permitir('ESTOQUE_GERENCIAR'), catalogo.inativarProduto);
router.get('/produtos/:id/movimentacoes', permitir('ESTOQUE_VISUALIZAR'), catalogo.movimentacoes);
router.post('/produtos/:id/movimentar', permitir('ESTOQUE_GERENCIAR'), controller.movimentar);
router.get('/estoque/tecnicos', permitir('ESTOQUE_VISUALIZAR'), controller.estoqueTecnicos);
router.post('/produtos/:id/transferir-tecnico', permitir('ESTOQUE_GERENCIAR'), controller.transferirTecnico);
router.post('/produtos/:id/devolver-tecnico', permitir('ESTOQUE_GERENCIAR'), catalogo.devolverTecnico);
router.get('/orcamentos', permitir('FINANCEIRO_VISUALIZAR'), controller.listarOrcamentos);
router.post('/orcamentos', permitir('FINANCEIRO_GERENCIAR'), controller.criarOrcamento);
router.get('/orcamentos/:id', permitir('FINANCEIRO_VISUALIZAR'), controller.detalheOrcamento);
router.patch('/orcamentos/:id/status', permitir('FINANCEIRO_GERENCIAR'), controller.statusOrcamento);
router.post('/orcamentos/:id/converter', permitir('FINANCEIRO_GERENCIAR'), controller.converter);
router.post('/os/:id/pagamentos', permitir('FINANCEIRO_GERENCIAR'), controller.registrarPagamento);
router.get('/financeiro/dashboard', permitir('FINANCEIRO_VISUALIZAR'), controller.dashboard);

module.exports = router;
