const express = require('express');
const multer = require('multer');
const OsController = require('../controllers/OsController');
const FotoController = require('../controllers/FotoController');
const authMiddleware = require('../middlewares/authMiddleware');
const permitir = require('../middlewares/permissaoMiddleware');
const uploadConfig = require('../config/upload');
const { validarCriacaoOs, validarStatusOs, validarReagendamento, validarExecucaoOs, validarEventoOs } = require('../validators/osValidator');

const router = express.Router();
const upload = multer(uploadConfig);

router.use(authMiddleware);
router.get('/os/agenda', permitir('AGENDA_VISUALIZAR'), OsController.listarAgenda);
router.get('/os/finalizadas', permitir('AGENDA_VISUALIZAR'), OsController.listarFinalizadas);
router.get('/os/todas', permitir('AGENDA_VISUALIZAR'), OsController.listarTodas);
router.get('/os/:id', permitir('AGENDA_VISUALIZAR'), OsController.detalhes);
router.post('/os', permitir('OS_CRIAR'), validarCriacaoOs, OsController.criar);
router.patch('/os/:id/execucao', permitir('OS_EXECUTAR'), validarExecucaoOs, OsController.salvarExecucao);
router.patch('/os/:id/status', permitir('OS_EXECUTAR'), validarStatusOs, OsController.atualizarStatus);
router.post('/os/:id/eventos', permitir('OS_EXECUTAR'), validarEventoOs, OsController.registrarEvento);
router.post('/os/:id/retorno', permitir('OS_EXECUTAR'), OsController.criarRetorno);
router.patch('/os/:id/reagendar', permitir('OS_REAGENDAR'), validarReagendamento, OsController.reagendar);
router.patch('/os/:id/agendar', permitir('OS_EXECUTAR'), OsController.agendarVisita);
router.post('/os/fotos', permitir('OS_EXECUTAR'), upload.single('imagem'), FotoController.upload);
router.delete('/os/fotos/:id', permitir('OS_EXECUTAR'), FotoController.remover);

module.exports = router;
