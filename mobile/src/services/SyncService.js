import * as Network from 'expo-network';
import { listarFila, registrarFalha, removerFila } from '../database/sqlite';
import { api } from './api';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Verifica se o erro recebido indica que o servidor já processou essa operação.
 * Códigos 200 e 409 com mensagem "já sincronizado" são considerados idempotentes:
 * o item pode ser removido da fila sem reenvio.
 */
function jaProcessado(error) {
  if (!error.status) return false;
  if (error.status === 409 && /já sincronizado|já existe|duplicate/i.test(error.message || '')) return true;
  return false;
}

/**
 * Tenta sincronizar os itens pendentes na fila offline.
 *
 * Idempotência:
 *  - Cada item carrega um `_client_uuid` gerado no momento do enfileiramento.
 *  - Os endpoints que suportam `client_uuid` usam esse campo para deduplicar
 *    no lado do servidor (ex.: POST /os/fotos).
 *  - Respostas 2xx ou 409-"já-processado" são tratadas como sucesso:
 *    o item é removido da fila independentemente.
 *  - Erros 4xx (exceto os idempotentes acima) são falhas permanentes: o item
 *    é marcado com erro mas a fila continua processando os próximos.
 *  - Erros 5xx ou de rede interrompem o loop para não sobrecarregar o servidor.
 *
 * @param {number|null} itemId - Se informado, processa apenas esse item da fila.
 * @returns {{ enviados: number }}
 */
export async function tentarSincronizarOffline(itemId = null) {
  const rede = await Network.getNetworkStateAsync();
  if (!rede.isConnected || rede.isInternetReachable === false) return { enviados: 0 };

  let enviados = 0;
  const fila = await listarFila();
  const itens = itemId === null ? fila : fila.filter((v) => v.id === itemId);

  for (const item of itens) {
    try {
      const payload = JSON.parse(item.payload);
      // _client_uuid é injetado por enfileirar() para identificar a operação
      const clientUuid = payload._client_uuid || item.client_uuid || null;

      await _despachar(item.tipo, payload, clientUuid);

      await removerFila(item.id);
      enviados += 1;
    } catch (error) {
      if (jaProcessado(error)) {
        // Servidor já processou — pode remover sem contar como enviado agora
        await removerFila(item.id);
        enviados += 1;
        continue;
      }

      await registrarFalha(item.id, error.message);

      if (error.status && error.status >= 400 && error.status < 500) {
        // Erro permanente do cliente (dados inválidos, acesso negado etc.)
        // → marca e segue para o próximo item
        continue;
      }

      // Erro de rede ou 5xx → interrompe para não marttelar o servidor
      break;
    }
  }

  return { enviados };
}

/**
 * Mapeia o tipo do item da fila para a chamada de API correspondente.
 * Extrai `_client_uuid` do payload antes de enviar para não poluir os dados.
 */
async function _despachar(tipo, payload, clientUuid) {
  // Remove a chave interna antes de enviar ao servidor
  // eslint-disable-next-line no-unused-vars
  const { _client_uuid, ...dados } = payload;

  switch (tipo) {
    case 'CRIAR_OS':
      return api.chamadaAutenticada('/os', 'POST', dados);

    case 'STATUS_OS':
      return api.chamadaAutenticada(
        `/os/${dados.os_id}/status`,
        'PATCH',
        { novo_status: dados.novo_status },
      );

    case 'EVENTO_OS':
      return api.chamadaAutenticada(
        `/os/${dados.os_id}/eventos`,
        'POST',
        dados.dados,
      );

    case 'EXECUCAO_OS':
      return api.chamadaAutenticada(
        `/os/${dados.os_id}/execucao`,
        'PATCH',
        dados.dados,
      );

    case 'RETORNO_OS':
      return api.chamadaAutenticada(
        `/os/${dados.os_id}/retorno`,
        'POST',
        dados.dados,
      );

    case 'AGENDAR_OS':
      return api.chamadaAutenticada(
        `/os/${dados.os_id}/agendar`,
        'PATCH',
        dados.dados,
      );

    case 'FOTO_OS': {
      // Passa client_uuid para deduplicação no servidor
      const metadados = { ...(dados.metadados || {}), client_uuid: clientUuid };
      const resultado = await api.uploadFoto(
        dados.os_id,
        dados.tipo,
        { uri: dados.uri, name: dados.nome, type: dados.mime },
        metadados,
      );
      // Remove arquivo temporário local independentemente do resultado
      await FileSystem.deleteAsync(dados.uri, { idempotent: true }).catch(() => {});
      return resultado;
    }

    default:
      // Tipo desconhecido — não tenta reenviar, remove da fila
      throw Object.assign(new Error(`Tipo de fila desconhecido: ${tipo}`), { status: 400 });
  }
}
