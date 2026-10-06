import * as Network from 'expo-network';
import { buscarOsNaoSincronizadas, marcarComoSincronizada } from '../database/sqlite';
import { api } from './api';

export const tentarSincronizarOffline = async () => {
  const statusRede = await Network.getNetworkStateAsync();
  
  if (statusRede.isConnected && statusRede.isInternetReachable) {
    
    // 1. Pega tudo que ficou preso no SQLite
    const pendentes = await buscarOsNaoSincronizadas();
    
    if (pendentes.length > 0) {
      console.log(`Encontradas ${pendentes.length} O.S. para sincronizar...`);

      // 2. Tenta enviar uma a uma para o backend Node.js
      for (const os of pendentes) {
        try {
          // Aqui você reutiliza a sua função de enviar FormData (para fotos) e o PATCH de status
          await api.chamadaAutenticada(`/os/${os.os_id}/status`, 'PATCH', { 
            novo_status: 'FINALIZADA',
            descricao: os.descricao 
          });
          
          // 3. Se a API respondeu OK, marcamos como "sincronizado=1" no celular
          marcarComoSincronizada(os.id);
          console.log(`O.S. local #${os.id} enviada com sucesso!`);
          
        } catch (erro) {
          console.error(`Falha ao sincronizar O.S. #${os.id}:`, erro.message);
          // O loop continua, e ele tentará novamente na próxima vez que o app abrir
        }
      }
    }
  }
};