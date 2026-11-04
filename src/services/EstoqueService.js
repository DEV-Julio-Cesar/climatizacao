async function baixar(client, id, os, usuario) {
  const resultado = await client.query(`SELECT oi.id,oi.referencia_id,oi.quantidade,p.nome,p.estoque,
      et.quantidade estoque_tecnico,et.tecnico_id FROM os_itens oi
      JOIN produtos p ON p.id=oi.referencia_id AND p.empresa_id=$2
      LEFT JOIN estoque_tecnico et ON et.produto_id=p.id AND et.tecnico_id=$3
      WHERE oi.os_id=$1 AND oi.tipo='PECA' AND oi.estoque_baixado=FALSE
      ORDER BY p.id,oi.id FOR UPDATE OF p`, [id, usuario.empresa_id, os.tecnico_id]);
  const grupos = new Map();
  for (const item of resultado.rows) {
    const grupo = grupos.get(item.referencia_id) || { ...item, quantidade: 0, ids: [] };
    grupo.quantidade += Number(item.quantidade); grupo.ids.push(item.id);
    grupos.set(item.referencia_id, grupo);
  }
  for (const item of grupos.values()) {
    const qtd = item.quantidade;
    const atualizada = item.tecnico_id
      ? await client.query('UPDATE estoque_tecnico SET quantidade=quantidade-$1,updated_at=NOW() WHERE tecnico_id=$2 AND produto_id=$3 AND quantidade>=$1 RETURNING produto_id', [qtd, os.tecnico_id, item.referencia_id])
      : await client.query('UPDATE produtos SET estoque=estoque-$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3 AND estoque>=$1 RETURNING id', [qtd, item.referencia_id, usuario.empresa_id]);
    if (!atualizada.rows.length) throw Object.assign(new Error(`Estoque insuficiente para ${item.nome}.`), { status: 422 });
    await client.query("INSERT INTO estoque_movimentos(empresa_id,produto_id,tipo,quantidade,observacao,os_id,usuario_id) VALUES($1,$2,'SAIDA',$3,$4,$5,$6)", [usuario.empresa_id, item.referencia_id, qtd, `Baixa automática da O.S. #${id}`, id, usuario.usuario_id]);
    await client.query('UPDATE os_itens SET estoque_baixado=TRUE WHERE id=ANY($1::int[]) AND os_id=$2', [item.ids, id]);
  }
  await client.query("UPDATE estoque_reservas SET status='CONSUMIDO',consumido_em=NOW(),updated_at=NOW() WHERE os_id=$1 AND empresa_id=$2 AND status='ENTREGUE'", [id, usuario.empresa_id]);
}
module.exports = { baixar };
