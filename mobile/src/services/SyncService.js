import * as Network from 'expo-network';
import { listarFila, registrarFalha, removerFila } from '../database/sqlite';
import { api } from './api';

export async function tentarSincronizarOffline() {
  const rede = await Network.getNetworkStateAsync();
  if (!rede.isConnected || rede.isInternetReachable === false) return { enviados: 0 };
  let enviados = 0;
  for (const item of await listarFila()) {
    try {
      const payload = JSON.parse(item.payload);
      if (item.tipo === 'CRIAR_OS') await api.chamadaAutenticada('/os', 'POST', payload);
      else if (item.tipo === 'STATUS_OS') await api.chamadaAutenticada(`/os/${payload.os_id}/status`, 'PATCH', { novo_status: payload.novo_status });
      await removerFila(item.id); enviados += 1;
    } catch (error) {
      await registrarFalha(item.id, error.message);
      if (error.status && error.status < 500) continue;
      break;
    }
  }
  return { enviados };
}
