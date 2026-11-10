const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const db = require('./config/database');
const logger = require('./config/logger');
const requestLogger = require('./middlewares/requestLogger');
const AuthController = require('./controllers/AuthController');
const RecuperacaoSenhaController = require('./controllers/RecuperacaoSenhaController');
const LgpdController = require('./controllers/LgpdController');
const PrivacidadeController = require('./controllers/PrivacidadeController');
const osRoutes = require('./routes/os.routes');
const cadastroRoutes = require('./routes/cadastro.routes');
const financeiroRoutes = require('./routes/financeiro.routes');
const gestaoRoutes = require('./routes/gestao.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const suprimentosRoutes = require('./routes/suprimentos.routes');
const authMiddleware = require('./middlewares/authMiddleware');
const { autorizarArquivo, assinarResposta } = require('./services/ArquivoService');

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
  app.use(cookieParser());
  app.use(requestLogger);
  app.use((req, res, next) => {
    const origin = req.get('origin');
    const allowedOrigins = String(process.env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
    const sameOrigin = !origin || origin === `${req.protocol}://${req.get('host')}`;
    if (origin && !sameOrigin && !allowedOrigins.includes(origin)) return res.status(403).json({ erro: 'Origem não autorizada.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { req.rawBody = buffer; } }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = corpo => json(req.usuarioLogado ? assinarResposta(corpo, req.usuarioLogado.empresa_id) : corpo);
    next();
  });
  app.get('/arquivos/fotos/:chave', autorizarArquivo, async (req, res) => {
    try {
      const resultado = await db.query(
        'SELECT f.conteudo,f.mime_type FROM os_fotos f JOIN ordens_servico os ON os.id=f.os_id WHERE f.storage_key=$1 AND f.conteudo IS NOT NULL AND os.empresa_id=$2 AND os.deleted_at IS NULL',
        [req.params.chave, req.empresaArquivo],
      );
      const arquivo = resultado.rows[0];
      if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
      res.setHeader('Content-Type', arquivo.mime_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(arquivo.conteudo);
    } catch (_error) {
      return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    }
  });
  app.get('/arquivos/ordens/:chave.pdf', autorizarArquivo, async (req, res) => {
    try {
      const resultado = await db.query(
        'SELECT id,pdf_conteudo FROM ordens_servico WHERE pdf_storage_key=$1 AND pdf_conteudo IS NOT NULL AND deleted_at IS NULL AND empresa_id=$2',
        [req.params.chave, req.empresaArquivo],
      );
      const arquivo = resultado.rows[0];
      if (!arquivo) return res.status(404).json({ erro: 'Relatório não encontrado.' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="ordem_servico_${arquivo.id}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(arquivo.pdf_conteudo);
    } catch (_error) {
      return res.status(404).json({ erro: 'Relatório não encontrado.' });
    }
  });
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
  app.get('/privacidade', (_req, res) => {
    const escapar = valor => String(valor).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const html = require('fs').readFileSync(path.resolve(__dirname, 'web', 'privacidade.html'), 'utf8');
    res.setHeader('Cache-Control', 'no-store');
    return res.type('html').send(html
      .replace('{{RESPONSAVEL}}', () => escapar(process.env.PRIVACY_CONTROLLER_NAME || 'ClimaSaaS — consulte a identificação jurídica no contrato com o fornecedor da plataforma.'))
      .replace('{{CONTATO}}', () => escapar(process.env.PRIVACY_CONTACT_EMAIL || 'Solicite o contato de privacidade à empresa que cadastrou seus dados, pelos canais do seu contrato ou atendimento.')));
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/health/ready', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      return res.json({ status: 'ready', database: 'ok', timestamp: new Date().toISOString() });
    } catch (_error) { return res.status(503).json({ status: 'not_ready', database: 'error' }); }
  });
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.' } });
  const contaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
    keyGenerator: req => crypto.createHash('sha256').update((typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'')).digest('hex'),
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: 'Muitas tentativas para esta conta. Aguarde 15 minutos.' } });
  app.post('/login', loginLimiter, contaLimiter, AuthController.login);
  const recuperarIp = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{erro:'Muitas solicitações. Aguarde 15 minutos.'}});
  const recuperarConta = rateLimit({windowMs:15*60*1000,limit:3,keyGenerator:req=>crypto.createHash('sha256').update((typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'')).digest('hex'),standardHeaders:'draft-8',legacyHeaders:false,message:{erro:'Muitas solicitações para este e-mail. Aguarde 15 minutos.'}});
  const redefinirIp = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{erro:'Muitas tentativas. Aguarde 15 minutos.'}});
  const redefinirToken = rateLimit({windowMs:15*60*1000,limit:5,keyGenerator:req=>crypto.createHash('sha256').update((typeof req.body?.token==='string'?req.body.token:'')).digest('hex'),standardHeaders:'draft-8',legacyHeaders:false,message:{erro:'Muitas tentativas para este link. Aguarde ou solicite outro.'}});
  app.post('/auth/senha/solicitar',recuperarIp,recuperarConta,RecuperacaoSenhaController.solicitar);
  app.post('/auth/senha/redefinir',redefinirIp,redefinirToken,RecuperacaoSenhaController.redefinir);
  // Logout: limpa o cookie HttpOnly do refresh token
  app.post('/auth/refresh/logout', AuthController.logout);
  app.post('/logout', AuthController.logout);
  // Refresh: limite mais generoso, mas ainda protegido contra abuso
  const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: 'Muitas tentativas de renovação de sessão. Aguarde e tente novamente.' } });
  app.post('/auth/refresh', refreshLimiter, AuthController.refresh);
  app.post('/conta/senha', authMiddleware, AuthController.alterarSenha);
  app.get('/conta/sessao', authMiddleware, (req, res) => {
    const u = req.usuarioLogado;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ usuario: { id: u.usuario_id, empresa_id: u.empresa_id, nome: u.nome, perfil: u.perfil, permissoes: u.permissoes } });
  });
  app.get('/eventos',authMiddleware,require('./services/EventoService').stream);
  // Privacidade: resumo pessoal, desativação e análise de solicitações.
  app.get('/conta/dados',    authMiddleware, LgpdController.exportarDados);
  const exclusaoLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
    keyGenerator: req => `${req.usuarioLogado.empresa_id}:${req.usuarioLogado.usuario_id}`,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: 'Muitas tentativas de desativação. Aguarde 15 minutos.' } });
  app.delete('/conta/dados', authMiddleware, exclusaoLimiter, LgpdController.excluirDados);
  app.use('/privacidade/solicitacoes', (_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  app.post('/privacidade/solicitacoes', authMiddleware, PrivacidadeController.criar);
  app.get('/privacidade/solicitacoes', authMiddleware, PrivacidadeController.listar);
  app.get('/privacidade/solicitacoes/:id', authMiddleware, PrivacidadeController.detalhes);
  app.patch('/privacidade/solicitacoes/:id', authMiddleware, PrivacidadeController.atualizar);
  app.use(whatsappRoutes);
  app.use(osRoutes);
  app.use(cadastroRoutes);
  app.use(financeiroRoutes);
  app.use(suprimentosRoutes);
  app.use(gestaoRoutes);
  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use((error, _req, res, _next) => {
    logger.erro('erro_nao_tratado', {
      request_id: _req.id,
      metodo: _req.method,
      rota: _req.path,
      erro_mensagem: error.message,
      erro_stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    });
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erro: 'Arquivo excede 8 MB.' });
    // Erros com status explícito (lançados pelos controllers) retornam a mensagem original.
    // Erros sem status (inesperados / internos) usam 500 e mensagem genérica para não
    // vazar detalhes de implementação ao cliente.
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    const mensagem = status < 500 ? error.message : 'Erro interno do servidor.';
    return res.status(status).json({ erro: mensagem });
  });
  return app;
}

module.exports = createApp;
