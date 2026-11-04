import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from './api';

export async function exportarOrcamentoPdf(id, acao) {
  if (Platform.OS === 'web') throw new Error('Use o aplicativo no celular para salvar ou compartilhar o PDF.');
  const salvarAndroid = acao === 'salvar' && Platform.OS === 'android';
  if (!salvarAndroid && !(await Sharing.isAvailableAsync())) {
    throw new Error('O compartilhamento de arquivos não está disponível neste aparelho.');
  }
  const bytes = await api.baixarOrcamentoPdf(id);
  if (salvarAndroid) {
    let pasta;
    try { pasta = await Directory.pickDirectoryAsync(); }
    catch (error) {
      if (error.code === 'ERR_PICKER_CANCELLED') return false;
      throw error;
    }
    const destino = pasta.createFile(`orcamento_${id}_${Date.now()}.pdf`, 'application/pdf');
    destino.write(bytes);
    return true;
  }
  // Cada exportação tem seu arquivo, evitando sobrescrever anexos ainda em uso.
  const arquivo = new File(Paths.cache, `orcamento_${id}_${Date.now()}.pdf`);
  arquivo.write(bytes);
  await Sharing.shareAsync(arquivo.uri, {
    mimeType: 'application/pdf', UTI: 'com.adobe.pdf',
    dialogTitle: acao === 'salvar' ? 'Salvar orçamento em Arquivos' : 'Compartilhar orçamento',
  });
  return false;
}
