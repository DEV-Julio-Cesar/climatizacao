const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const db = require('./config/database');
const AuthController = require('./controllers/AuthController');
const osRoutes = require('./routes/os.routes');
const cadastroRoutes = require('./routes/cadastro.routes');
const financeiroRoutes = require('./routes/financeiro.routes');
const gestaoRoutes = require('./routes/gestao.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const suprimentosRoutes = require('./routes/suprimentos.routes');
const authMiddleware = require('./middlewares/authMiddleware');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    req.id = req.get('x-request-id') || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(compression());
  app.use((req, res, next) => {
    const origin = req.get('origin');
    const allowedOrigins = String(process.env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
    const sameOrigin = !origin || origin === `${req.protocol}://${req.get('host')}`;
    if (origin && !sameOrigin && !allowedOrigins.includes(origin)) return res.status(403).json({ erro: 'Origem não autorizada.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { req.rawBody = buffer; } }));
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
  app.get('/health/ready', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      return res.json({ status: 'ready', database: 'ok', timestamp: new Date().toISOString() });
    } catch (_error) { return res.status(503).json({ status: 'not_ready', database: 'error' }); }
  });
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.' } });
  app.post('/login', loginLimiter, AuthController.login);
  app.post('/conta/senha', authMiddleware, AuthController.alterarSenha);
  app.use(whatsappRoutes);
  app.use(osRoutes);
  app.use(cadastroRoutes);
  app.use(financeiroRoutes);
  app.use(suprimentosRoutes);
  app.use(gestaoRoutes);
  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use((error, _req, res, _next) => {
    console.error(JSON.stringify({ nivel:'erro', request_id:_req.id, metodo:_req.method, rota:_req.originalUrl, mensagem:error.message }));
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erro: 'Arquivo excede 8 MB.' });
    return res.status(400).json({ erro: error.message || 'Erro interno do servidor.' });
  });
  return app;
}

module.exports = createApp;
