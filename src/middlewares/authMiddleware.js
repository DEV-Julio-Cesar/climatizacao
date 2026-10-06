const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'chave_super_secreta_clima';

const verificarToken = (req, res, next) => {
  // O token geralmente é enviado no cabeçalho: "Authorization: Bearer <token>"
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: 'Token não fornecido.' });
  }

  // Remove a palavra "Bearer " e pega só o hash
  const partes = authHeader.split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    return res.status(401).json({ erro: 'Token mal formatado.' });
  }

  const token = partes[1];

  try {
    // A função verify checa se o token foi assinado com a NOSSA chave secreta
    const payload = jwt.verify(token, JWT_SECRET);

    // Se válido, injetamos os dados do técnico logado direto na requisição (req).
    // Isso é fantástico, pois no controller de O.S. não precisamos mais receber 
    // o "tecnico_id" e "empresa_id" do frontend (onde poderiam ser fraudados),
    // pegamos direto da assinatura criptografada: req.usuarioLogado.empresa_id.
    req.usuarioLogado = payload;

    return next(); // Libera a passagem
  } catch (erro) {
    return res.status(401).json({ erro: 'Token inválido ou expirado. Faça login novamente.' });
  }
};

module.exports = verificarToken;