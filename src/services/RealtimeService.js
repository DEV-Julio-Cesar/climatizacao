const clientes = new Map();

function inscrever(empresaId, resposta) {
  const chave = String(empresaId);
  if (!clientes.has(chave)) clientes.set(chave, new Set());
  clientes.get(chave).add(resposta);
  return () => {
    const grupo = clientes.get(chave);
    grupo?.delete(resposta);
    if (!grupo?.size) clientes.delete(chave);
  };
}

function publicar(empresaId, tipo, dados = {}) {
  const bloco = `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const resposta of clientes.get(String(empresaId)) || []) {
    try { resposta.write(bloco); } catch { /* removida quando a conexão fechar */ }
  }
}

function conectar(req, res) {
  res.status(200);
  res.set({ 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'X-Accel-Buffering':'no' });
  res.flushHeaders?.();
  res.write('event: conectado\ndata: {"ok":true}\n\n');
  const remover = inscrever(req.usuarioLogado.empresa_id, res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  heartbeat.unref?.();
  req.on('close', () => { clearInterval(heartbeat); remover(); });
}

module.exports = { conectar, publicar };
