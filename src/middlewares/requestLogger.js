const logger = require('../config/logger');

// Rotas de health check não precisam aparecer nos logs (muito barulhentas)
const ROTAS_SILENCIOSAS = new Set(['/health', '/health/ready']);

/**
 * Middleware de logging estruturado de requisições HTTP.
 *
 * Registra ao final de cada resposta:
 *   - método, rota, status, duração em ms, request_id, usuario_id (quando autenticado)
 *
 * Nunca loga o corpo da requisição para evitar vazar senhas ou tokens.
 */
module.exports = function requestLogger(req, res, next) {
  if (ROTAS_SILENCIOSAS.has(req.path)) return next();

  const inicio = Date.now();

  res.on('finish', () => {
    const duracao = Date.now() - inicio;
    const nivel = res.statusCode >= 500 ? 'erro' : res.statusCode >= 400 ? 'aviso' : 'info';

    logger[nivel]('http', {
      request_id: req.id,
      metodo: req.method,
      rota: req.route?.path ?? req.path,
      status: res.statusCode,
      duracao_ms: duracao,
      usuario_id: req.usuarioLogado?.usuario_id ?? null,
      empresa_id: req.usuarioLogado?.empresa_id ?? null,
      ip: req.ip,
    });
  });

  return next();
};
