const crypto = require('crypto');
const db = require('../config/database');
function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(Object.keys(valor).sort().map(chave => [chave, ordenar(valor[chave])]));
}
async function transacao(req, executar) {
  const chave = req.get?.('Idempotency-Key');
  if (!chave) return db.transaction(executar);
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(chave)) throw Object.assign(new Error('Identificador de operação inválido.'), { status: 400 });
  const { empresa_id, usuario_id } = req.usuarioLogado;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([req.method, req.path, ordenar(req.body)])).digest('hex');
  return db.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`operacao:${empresa_id}:${usuario_id}:${chave}`]);
    const anterior = (await client.query('SELECT fingerprint,resultado FROM operacoes_idempotentes WHERE empresa_id=$1 AND usuario_id=$2 AND chave=$3', [empresa_id, usuario_id, chave])).rows[0];
    if (anterior) {
      if (anterior.fingerprint !== fingerprint) throw Object.assign(new Error('Identificador já utilizado com outros dados.'), { status: 409 });
      req.operacaoRepetida = true;
      return anterior.resultado;
    }
    const resultado = await executar(client);
    await client.query('INSERT INTO operacoes_idempotentes(empresa_id,usuario_id,chave,fingerprint,resultado) VALUES($1,$2,$3,$4,$5::jsonb)', [empresa_id, usuario_id, chave, fingerprint, JSON.stringify(resultado ?? null)]);
    return resultado;
  });
}
module.exports = { transacao };
