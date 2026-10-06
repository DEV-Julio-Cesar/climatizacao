const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ erro: 'Token não fornecido ou mal formatado.' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ erro: 'Autenticação não configurada no servidor.' });
  try {
    req.usuarioLogado = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return next();
  } catch (_error) {
    return res.status(401).json({ erro: 'Token inválido ou expirado. Faça login novamente.' });
  }
};
