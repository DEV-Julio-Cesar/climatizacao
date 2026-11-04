const jwt = require('jsonwebtoken');

function assinarUrl(url, empresaId, expiresIn = '15m') {
  if (typeof url !== 'string' || !url.includes('/arquivos/')) return url;
  const parsed = new URL(url, process.env.APP_URL || 'http://localhost:3000');
  if (!/^\/arquivos\/(fotos\/[^/]+|ordens\/[^/]+\.pdf)$/.test(parsed.pathname)) return url;
  parsed.search = '';
  parsed.searchParams.set('acesso', jwt.sign({ caminho: parsed.pathname, empresa_id: empresaId, token_use: 'arquivo' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn }));
  return url.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.toString();
}

function autorizarArquivo(req, res, next) {
  try {
    const acesso = jwt.verify(req.query.acesso, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (acesso.token_use !== 'arquivo' || acesso.caminho !== req.path || !Number.isInteger(acesso.empresa_id)) throw new Error('Link inválido.');
    req.empresaArquivo = acesso.empresa_id;
    return next();
  } catch { return res.status(401).json({ erro: 'Link inválido ou expirado. Abra o arquivo novamente pela aplicação.' }); }
}

function assinarResposta(valor, empresaId) {
  if (Array.isArray(valor)) return valor.map(item => assinarResposta(item, empresaId));
  if (!valor || typeof valor !== 'object' || valor instanceof Date || Buffer.isBuffer(valor)) return valor;
  return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave,
    ['url', 'pdf_url'].includes(chave) && typeof item === 'string' ? assinarUrl(item, empresaId) : assinarResposta(item, empresaId),
  ]));
}

module.exports = { assinarUrl, autorizarArquivo, assinarResposta };
