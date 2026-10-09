import * as Network from 'expo-network';
import { listarFila, registrarFalha, removerFila } from '../database/sqlite';
import { api } from './api';
import * as FileSystem from 'expo-file-system/legacy';

export async function tentarSincronizarOffline(itemId = null) {
  const rede = await Network.getNetworkStateAsync();
  if (!rede.isConnected || rede.isInternetReachable === false) return { enviados: 0 };
  let enviados = 0;
  const fila=await listarFila();
  for (const item of itemId===null?fila:fila.filter(valor=>valor.id===itemId)) {
    try {
      const payload = JSON.parse(item.payload);
      if (item.tipo === 'CRIAR_OS') await api.chamadaAutenticada('/os', 'POST', payload);
      else if (item.tipo === 'STATUS_OS') await api.chamadaAutenticada(`/os/${payload.os_id}/status`, 'PATCH', { novo_status: payload.novo_status });
      else if (item.tipo === 'EVENTO_OS') await api.chamadaAutenticada(`/os/${payload.os_id}/eventos`, 'POST', payload.dados);
      else if (item.tipo === 'EXECUCAO_OS') await api.chamadaAutenticada(`/os/${payload.os_id}/execucao`, 'PATCH', payload.dados);
      else if (item.tipo === 'RETORNO_OS') await api.chamadaAutenticada(`/os/${payload.os_id}/retorno`, 'POST', payload.dados);
      else if (item.tipo === 'FOTO_OS') { await api.uploadFoto(payload.os_id, payload.tipo, { uri:payload.uri, name:payload.nome, type:payload.mime }, payload.metadados || {}); await FileSystem.deleteAsync(payload.uri, { idempotent:true }).catch(()=>{}); }
      await removerFila(item.id); enviados += 1;
    } catch (error) {
      await registrarFalha(item.id, error.message);
      if (error.status && error.status < 500) continue;
      break;
    }
  }
  return { enviados };
}
