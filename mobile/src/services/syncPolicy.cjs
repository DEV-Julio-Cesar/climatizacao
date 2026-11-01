'use strict';

const MAX_TENTATIVAS = 5;

function jaProcessado(error) {
  return Boolean(error?.status === 409
    && /já sincronizado|já existe|duplicate/i.test(error.message || ''));
}

async function processarFila(itens, dependencias) {
  const { despachar, remover, registrarFalha, descartar } = dependencias;
  let enviados = 0;
  for (const item of itens) {
    try {
      const payload = JSON.parse(item.payload);
      const clientUuid = payload._client_uuid || item.client_uuid || null;
      await despachar(item.tipo, payload, clientUuid);
      await remover(item.id);
      enviados += 1;
    } catch (error) {
      if (jaProcessado(error)) {
        await remover(item.id);
        enviados += 1;
        continue;
      }
      await registrarFalha(item.id, error.message);
      if ((item.tentativas || 0) + 1 >= MAX_TENTATIVAS) {
        await descartar(item.id);
        continue;
      }
      if (error.status >= 400 && error.status < 500) continue;
      break;
    }
  }
  return { enviados };
}

module.exports = { MAX_TENTATIVAS, jaProcessado, processarFila };
