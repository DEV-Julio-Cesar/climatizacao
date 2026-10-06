const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const CadastroController = require('../controllers/CadastroController');
const { validarCliente, validarEquipamento } = require('../validators/cadastroValidator');

const router = express.Router();
router.use(authMiddleware);
router.get('/tecnicos', CadastroController.listarTecnicos);
router.get('/clientes', CadastroController.listarClientes);
router.post('/clientes', validarCliente, CadastroController.criarCliente);
router.patch('/clientes/:id', validarCliente, CadastroController.atualizarCliente);
router.post('/equipamentos', validarEquipamento, CadastroController.criarEquipamento.bind(CadastroController));
router.patch('/equipamentos/:id', validarEquipamento, CadastroController.atualizarEquipamento.bind(CadastroController));
router.get('/equipamentos/:id', CadastroController.detalheEquipamento);
module.exports = router;
