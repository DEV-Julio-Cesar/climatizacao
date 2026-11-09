const crypto = require('crypto');

function segredo(valorLegado) {
  const valor = valorLegado || process.env.DATA_ENCRYPTION_SECRET || (process.env.NODE_ENV !== 'production' ? process.env.JWT_SECRET : null);
  if (!valor) throw new Error('Segredo de proteção de dados não configurado.');
  return crypto.createHash('sha256').update(`climasaas:documentos:${valor}`).digest();
}

function normalizar(valor) { return String(valor || '').replace(/\D/g, ''); }

function cifrar(valor) {
  const documento = normalizar(valor);
  if (!documento) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', segredo(), iv);
  const conteudo = Buffer.concat([cipher.update(documento, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), conteudo].map((parte) => parte.toString('base64')).join('.');
}

function decifrarComChave(valor, chave) {
  if (!valor) return null;
  try {
    const partes = valor.split('.');
    if (partes.length !== 3 || partes.some((parte) => Buffer.from(parte, 'base64').toString('base64') !== parte)) return null;
    const [iv, tag, conteudo] = partes.map((parte) => Buffer.from(parte, 'base64'));
    if (iv.length !== 12 || tag.length !== 16 || !conteudo.length) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', segredo(chave), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString('utf8');
  } catch { return null; }
}

function decifrar(valor) {
  return decifrarComChave(valor) || (process.env.DATA_ENCRYPTION_LEGACY_SECRET ? decifrarComChave(valor,process.env.DATA_ENCRYPTION_LEGACY_SECRET) : null);
}

function hash(valor, empresaId) {
  const documento = normalizar(valor);
  if (!documento) return null;
  return crypto.createHmac('sha256', segredo()).update(`${empresaId}:${documento}`).digest('hex');
}

function proteger(valor, empresaId) {
  const documento = normalizar(valor);
  return { documento, documento_cifrado: cifrar(documento), documento_hash: hash(documento, empresaId) };
}

module.exports = { normalizar, cifrar, decifrar, hash, proteger };
