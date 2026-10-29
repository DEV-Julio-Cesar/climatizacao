const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { padroes } = require('./permissaoMiddleware');

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
  if (req.usuarioLogado) return next();
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token)
    return res.status(401).json({ erro: 'Token não fornecido ou mal formatado.' });
  if (!process.env.JWT_SECRET)
    return res.status(500).json({ erro: 'Autenticação não configurada no servidor.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.token_use !== 'access' || !decoded.sid) throw new Error('Tipo de token inválido.');
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado. Faça login novamente.' });
  }

  try {
    const result = await db.query(
      `SELECT ativo, deleted_at, senha_alterada_em, perfil, nome,
              (SELECT COALESCE(json_agg(json_build_object('permissao',p.permissao,'permitido',p.permitido)),'[]')
                 FROM usuario_permissoes p WHERE p.usuario_id=usuarios.id) AS overrides
         FROM usuarios
        WHERE id = $1 AND empresa_id = $2
          AND EXISTS (SELECT 1 FROM empresas e WHERE e.id=usuarios.empresa_id AND e.ativo=TRUE AND e.deleted_at IS NULL)
          AND EXISTS (SELECT 1 FROM sessoes s WHERE s.id=$3 AND s.usuario_id=usuarios.id
            AND s.empresa_id=usuarios.empresa_id AND s.revogada_em IS NULL AND s.expira_em>NOW())`,
      [decoded.usuario_id, decoded.empresa_id, decoded.sid],
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
    if (usuario.perfil) {
      const permissoes = new Set(padroes[usuario.perfil] || []);
      for (const override of usuario.overrides || [])
        override.permitido ? permissoes.add(override.permissao) : permissoes.delete(override.permissao);
      decoded = { ...decoded, perfil: usuario.perfil, nome: usuario.nome, permissoes: [...permissoes] };
    }
  } catch (dbError) {
    const logger = require('../config/logger');
    logger.erro('authMiddleware.db', { request_id: req.id, erro_mensagem: dbError.message });
    return res.status(500).json({ erro: 'Erro interno ao validar autenticação.' });
  }

  req.usuarioLogado = decoded;
  return next();
};
