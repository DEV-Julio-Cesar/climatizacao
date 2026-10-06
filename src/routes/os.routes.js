const express = require('express');
const multer = require('multer');
const OsController = require('../controllers/OsController');
const FotoController = require('../controllers/FotoController');
const authMiddleware = require('../middlewares/authMiddleware');
const uploadConfig = require('../config/upload');
const { validarCriacaoOs, validarStatusOs, validarReagendamento, validarExecucaoOs } = require('../validators/osValidator');

const router = express.Router();
const upload = multer(uploadConfig);

router.use(authMiddleware);
router.get('/os/agenda', OsController.listarAgenda);
router.get('/os/finalizadas', OsController.listarFinalizadas);
router.get('/os/todas', OsController.listarTodas);
router.get('/os/:id', OsController.detalhes);
router.post('/os', validarCriacaoOs, OsController.criar);
router.patch('/os/:id/execucao', validarExecucaoOs, OsController.salvarExecucao);
router.patch('/os/:id/status', validarStatusOs, OsController.atualizarStatus);
router.patch('/os/:id/reagendar', validarReagendamento, OsController.reagendar);
router.post('/os/fotos', upload.single('imagem'), FotoController.upload);

module.exports = router;
