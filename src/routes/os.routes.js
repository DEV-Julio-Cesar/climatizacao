const express = require('express');
const multer = require('multer');
const OsController = require('../controllers/OsController');
const OsAgendaController = require('../controllers/os/OsAgendaController');
const OsEventoController = require('../controllers/os/OsEventoController');
const OsExecucaoController = require('../controllers/os/OsExecucaoController');
const FotoController = require('../controllers/FotoController');
const authMiddleware = require('../middlewares/authMiddleware');
const permitir = require('../middlewares/permissaoMiddleware');
const uploadConfig = require('../config/upload');
const {
  validarCriacaoOs,
  validarStatusOs,
  validarReagendamento,
  validarExecucaoOs,
  validarEventoOs,
} = require('../validators/osValidator');

const router = express.Router();
const upload = multer(uploadConfig);

router.use(authMiddleware);

// ── Listagem / leitura ──────────────────────────────────────────────────────
router.get('/os/agenda',      permitir('AGENDA_VISUALIZAR'), OsAgendaController.listarAgenda);
router.get('/os/finalizadas', permitir('AGENDA_VISUALIZAR'), OsAgendaController.listarFinalizadas);
router.get('/os/todas',       permitir('AGENDA_VISUALIZAR'), OsAgendaController.listarTodas);
router.get('/os/:id',         permitir('AGENDA_VISUALIZAR'), OsController.detalhes);

// ── Ciclo de vida ───────────────────────────────────────────────────────────
router.post('/os',                  permitir('OS_CRIAR'),      validarCriacaoOs,   OsController.criar);
router.patch('/os/:id/status',      permitir('OS_EXECUTAR'),   validarStatusOs,    OsController.atualizarStatus);
router.patch('/os/:id/reagendar',   permitir('OS_REAGENDAR'),  validarReagendamento, OsController.reagendar);

// ── Execução técnica ────────────────────────────────────────────────────────
router.patch('/os/:id/execucao',    permitir('OS_EXECUTAR'),   validarExecucaoOs,  OsExecucaoController.salvarExecucao);

// ── Eventos de campo ────────────────────────────────────────────────────────
router.post('/os/:id/eventos',      permitir('OS_EXECUTAR'),   validarEventoOs,    OsEventoController.registrarEvento);
router.post('/os/:id/retorno',      permitir('OS_EXECUTAR'),                       OsEventoController.criarRetorno);
router.patch('/os/:id/agendar',     permitir('OS_EXECUTAR'),                       OsEventoController.agendarVisita);

// ── Fotos ───────────────────────────────────────────────────────────────────
router.post('/os/fotos',            permitir('OS_EXECUTAR'),   upload.single('imagem'), FotoController.upload);
router.delete('/os/fotos/:id',      permitir('OS_EXECUTAR'),   FotoController.remover);

module.exports = router;
