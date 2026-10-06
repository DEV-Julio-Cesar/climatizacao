module.exports = (...perfis) => (req, res, next) => {
  if (!perfis.includes(req.usuarioLogado?.perfil)) {
    return res.status(403).json({ erro: 'Seu perfil não possui permissão para esta operação.' });
  }
  return next();
};
