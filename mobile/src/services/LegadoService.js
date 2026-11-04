import { listarFilaLegada, assumirLegado } from '../database/sqlite';
import { api } from './api';
import * as SecureStore from 'expo-secure-store';

export async function recuperarLegado() {
  const conta = await SecureStore.getItemAsync('climasaas_usuario');
  const fila = await listarFilaLegada();
  const referencias = fila.flatMap(item => {
    try {
      const payload = JSON.parse(item.payload);
      if(!['CRIAR_OS','STATUS_OS','EVENTO_OS','EXECUCAO_OS','RETORNO_OS','AGENDAR_OS','FOTO_OS'].includes(item.tipo)) return [];
      const referencia = { id:item.id, tipo:item.tipo };
      if (item.tipo === 'CRIAR_OS') referencia.cliente_id=Number(payload.cliente_id);
      else referencia.os_id=Number(payload.os_id);
      const id=referencia.os_id ?? referencia.cliente_id;
      if(!Number.isInteger(id)||id<=0)return [];
      return [referencia];
    } catch { return []; }
  });
  if (!referencias.length) return { recuperados:0, restantes:fila.length };
  const { autorizados } = await api.chamadaAutenticada('/offline/verificar-legado','POST',{itens:referencias});
  if (conta !== await SecureStore.getItemAsync('climasaas_usuario')) throw new Error('A conta mudou. Repita a recuperação.');
  const recuperados = await assumirLegado(autorizados);
  return { recuperados, restantes:fila.length-recuperados };
}
