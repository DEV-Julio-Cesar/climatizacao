const crypto = require('crypto');

function segredo() {
  const valor = process.env.FILE_URL_SECRET || (process.env.NODE_ENV !== 'production' ? process.env.JWT_SECRET : null);
  if (!valor) throw new Error('Segredo de URLs de arquivo não configurado.');
  return crypto.createHash('sha256').update(`climasaas:arquivos:${valor}`).digest();
}

function assinatura(chave, expira, tipo = 'foto') {
  return crypto.createHmac('sha256', segredo()).update(`${tipo}:${chave}:${expira}`).digest('base64url');
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

function validarFoto(chave, expira, fornecida, tipo = 'foto') {
  const exp = Number(expira);
  const agora = Math.floor(Date.now() / 1000);
  if (!chave || !Number.isInteger(exp) || exp < agora || exp > agora + 3600 || typeof fornecida !== 'string') return false;
  const esperada = assinatura(chave, exp, tipo);
  const a = Buffer.from(esperada);
  const b = Buffer.from(fornecida);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function assinarPdf(url) {
  if (!url) return null;
  const match = String(url).match(/^(https?:\/\/[^?#]+)?\/arquivos\/ordens\/([a-f0-9-]{36})\.pdf(?:\?.*)?$/i);
  if (!match) return null;
  const chave = match[2], exp = Math.floor(Date.now()/1000)+900;
  const base = String(url).split('?')[0];
  return `${base}?exp=${exp}&sig=${assinatura(chave,exp,'pdf')}`;
}
function protegerResposta(valor) {
  if (Array.isArray(valor)) return valor.map(protegerResposta);
  if (!valor || typeof valor !== 'object' || valor instanceof Date || Buffer.isBuffer(valor)) return valor;
  return Object.fromEntries(Object.entries(valor).map(([k,v])=>[k,k==='pdf_url'?assinarPdf(v):protegerResposta(v)]));
}
module.exports = { assinarFoto, validarFoto, assinarPdf, protegerResposta, validarPdf:(chave,exp,sig)=>validarFoto(chave,exp,sig,'pdf') };
