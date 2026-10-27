const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Middleware de autenticação JWT.
 *
 * Além de verificar a assinatura e a expiração do token, consulta o banco
 * para confirmar que o usuário ainda está ativo e que o token não foi emitido
 * antes de uma troca de senha (campo `senha_alterada_em`).
 *
 * A consulta ao banco é leve (busca por PK com dois campos indexados) e
 * garante que tokens antigos sejam invalidados imediatamente após a troca
 * de senha, sem precisar de uma blocklist.
 */
module.exports = async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token)
    return res.status(401).json({ erro: 'Token não fornecido ou mal formatado.' });
  if (!process.env.JWT_SECRET)
    return res.status(500).json({ erro: 'Autenticação não configurada no servidor.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado. Faça login novamente.' });
  }

  try {
    const result = await db.query(
      `SELECT ativo, deleted_at, senha_alterada_em
         FROM usuarios
        WHERE id = $1 AND empresa_id = $2`,
      [decoded.usuario_id, decoded.empresa_id],
    );
    const usuario = result.rows[0];

    // Usuário removido ou desativado após emissão do token
    if (!usuario || !usuario.ativo || usuario.deleted_at) {
      return res.status(401).json({ erro: 'Usuário inativo ou removido. Faça login novamente.' });
    }

    // Token emitido antes da última troca de senha → força novo login
    if (usuario.senha_alterada_em) {
      const alteradoEm = Math.floor(new Date(usuario.senha_alterada_em).getTime() / 1000);
      if (decoded.iat < alteradoEm) {
        return res.status(401).json({ erro: 'Sessão expirada após troca de senha. Faça login novamente.' });
      }
    }
  } catch (dbError) {
    const logger = require('../config/logger');
    logger.erro('authMiddleware.db', { request_id: req.id, erro_mensagem: dbError.message });
    return res.status(500).json({ erro: 'Erro interno ao validar autenticação.' });
  }

  req.usuarioLogado = decoded;
  return next();
};
