const db = require('../config/database');
const erro = (mensagem, status) => Object.assign(new Error(mensagem), { status });
const centavos = valor => Math.round(Number(valor) * 100);

async function registrar(osId, usuario, dados, executor = db) {
  return executor.transaction(async client => {
    const ordem = await client.query('SELECT id,valor_total FROM ordens_servico WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL FOR UPDATE', [osId, usuario.empresa_id]);
    if (!ordem.rows[0]) throw erro('O.S. não encontrada.', 404);
    let anterior;
    if (dados.client_uuid) {
      anterior = (await client.query('SELECT * FROM pagamentos WHERE empresa_id=$1 AND client_uuid=$2', [usuario.empresa_id, dados.client_uuid])).rows[0];
      if (anterior && (Number(anterior.os_id) !== osId || anterior.forma !== dados.forma || centavos(anterior.valor) !== centavos(dados.valor) || (anterior.observacao || '') !== (dados.observacao || '')))
        throw erro('Identificador de pagamento já usado com outros dados.', 409);
    }
    const pagos = await client.query('SELECT COALESCE(SUM(valor),0) total FROM pagamentos WHERE os_id=$1 AND empresa_id=$2', [osId, usuario.empresa_id]);
    const saldo = centavos(ordem.rows[0].valor_total) - centavos(pagos.rows[0].total);
    if (anterior) return { ...anterior, saldo_restante: saldo / 100, repetido: true };
    const valor = centavos(dados.valor);
    if (valor > saldo) throw erro('Valor excede o saldo pendente.', 400);
    const resultado = await client.query('INSERT INTO pagamentos(empresa_id,os_id,forma,valor,observacao,recebido_por,client_uuid) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [usuario.empresa_id, osId, dados.forma, valor / 100, dados.observacao || null, usuario.usuario_id, dados.client_uuid || null]);
    return { ...resultado.rows[0], saldo_restante: (saldo - valor) / 100 };
  });
}
module.exports = { registrar };
