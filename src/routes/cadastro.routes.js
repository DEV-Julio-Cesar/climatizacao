const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const permitir = require('../middlewares/permissaoMiddleware');
const CadastroController = require('../controllers/CadastroController');
const { validarCliente, validarEquipamento } = require('../validators/cadastroValidator');

const router = express.Router();
router.use(authMiddleware);
router.get('/tecnicos', permitir('CLIENTES_VISUALIZAR'), CadastroController.listarTecnicos);
router.get('/clientes', permitir('CLIENTES_VISUALIZAR'), CadastroController.listarClientes);
router.post('/clientes', permitir('CLIENTES_GERENCIAR'), validarCliente, CadastroController.criarCliente);
router.patch('/clientes/:id', permitir('CLIENTES_GERENCIAR'), validarCliente, CadastroController.atualizarCliente);
router.post('/equipamentos', permitir('CLIENTES_GERENCIAR'), validarEquipamento, CadastroController.criarEquipamento.bind(CadastroController));
router.patch('/equipamentos/:id', permitir('CLIENTES_GERENCIAR'), validarEquipamento, CadastroController.atualizarEquipamento.bind(CadastroController));
router.get('/equipamentos/:id', permitir('CLIENTES_VISUALIZAR'), CadastroController.detalheEquipamento);
module.exports = router;
