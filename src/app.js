const express = require('express');
const path = require('path');
const AuthController = require('./controllers/AuthController');
const osRoutes = require('./routes/os.routes');
const cadastroRoutes = require('./routes/cadastro.routes');
const financeiroRoutes = require('./routes/financeiro.routes');
const gestaoRoutes = require('./routes/gestao.routes');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use('/uploads', express.static(path.resolve(__dirname, '..', 'tmp', 'uploads')));
  const painelDir=path.resolve(__dirname,'..','web','dist');
  app.use('/painel',express.static(painelDir));
  app.get('/painel/*',(_req,res)=>res.sendFile(path.join(painelDir,'index.html')));
  app.get('/', (_req, res) => res.json({
    nome: 'ClimaSaaS API',
    status: 'online',
    versao: '1.0.0',
    health: '/health',
    privacidade: '/privacidade',
  }));
  app.get('/privacidade', (_req, res) => res.sendFile(path.resolve(__dirname, 'web', 'privacidade.html')));
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.post('/login', AuthController.login);
  app.use(osRoutes);
  app.use(cadastroRoutes);
  app.use(financeiroRoutes);
  app.use(gestaoRoutes);
  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use((error, _req, res, _next) => {
    console.error('Erro não tratado:', error.message);
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erro: 'Arquivo excede 8 MB.' });
    return res.status(400).json({ erro: error.message || 'Erro interno do servidor.' });
  });
  return app;
}

module.exports = createApp;
