// Exemplo rápido da rota protegida
const express = require('express');
const OsController = require('../controllers/OsController');
const validarEntradaOs = require('../validators/osValidator'); // Seu script de validação

const routes = express.Router();

// A requisição bate na rota, é validada, e só então chama o controller
routes.post('/os', validarEntradaOs, OsController.criar);
// A rota é protegida pelo authMiddleware para garantir que apenas técnicos logados acessem
routes.get('/os/agenda', authMiddleware, OsController.listarAgenda);

module.exports = routes;