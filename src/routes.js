const express = require('express');
const multer = require('multer');
const uploadConfig = require('./config/upload');
const FotoController = require('./controllers/FotoController');
const authMiddleware = require('./middlewares/authMiddleware');

const routes = express.Router();
const upload = multer(uploadConfig);

// A Rota: Passa pelo porteiro (JWT), depois pelo Multer (Upload), depois Controller
routes.post(
  '/os/fotos', 
  authMiddleware, 
  upload.single('imagem'), // 'imagem' é o nome do campo no FormData do React Native
  FotoController.upload
);
// ... importações anteriores ...

// Rota PATCH (usada para atualizar dados parciais)
routes.patch('/os/:id/status', authMiddleware, OsController.atualizarStatus);

module.exports = routes;