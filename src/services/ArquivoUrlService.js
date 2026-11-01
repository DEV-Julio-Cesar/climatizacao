const crypto = require('crypto');

function segredo() {
  const valor = process.env.FILE_URL_SECRET || process.env.JWT_SECRET;
  if (!valor) throw new Error('Segredo de URLs de arquivo não configurado.');
  return crypto.createHash('sha256').update(`climasaas:arquivos:${valor}`).digest();
}

function assinatura(chave, expira) {
  return crypto.createHmac('sha256', segredo()).update(`foto:${chave}:${expira}`).digest('base64url');
}

function assinarFoto(url, chave, duracaoSegundos = 900) {
  if (!url || !chave) return null;
  const exp = Math.floor(Date.now() / 1000) + duracaoSegundos;
  let base;
  try {
    const atual = new URL(url);
    base = `${atual.origin}/arquivos/fotos/${chave}`;
  } catch {
    base = `/arquivos/fotos/${chave}`;
  }
  return `${base}?exp=${exp}&sig=${assinatura(chave, exp)}`;
}

function validarFoto(chave, expira, fornecida) {
  const exp = Number(expira);
  const agora = Math.floor(Date.now() / 1000);
  if (!chave || !Number.isInteger(exp) || exp < agora || exp > agora + 3600 || typeof fornecida !== 'string') return false;
  const esperada = assinatura(chave, exp);
  const a = Buffer.from(esperada);
  const b = Buffer.from(fornecida);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { assinarFoto, validarFoto };
