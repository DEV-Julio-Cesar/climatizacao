import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

export default function AssinaturaOS({ route, navigation }) {
  const { os_id } = route.params; const signature = useRef(); const [loading, setLoading] = useState(false);
  const finalizar = async (dataUrl) => {
    setLoading(true);
    try {
      // Recupera ordens criadas em versões anteriores que chegaram à assinatura ainda ABERTAS.
      // Se já estiver EM_ANDAMENTO, a API responde 409 e podemos seguir normalmente.
      try {
        await api.chamadaAutenticada(`/os/${os_id}/status`, 'PATCH', { novo_status: 'EM_ANDAMENTO' });
      } catch (statusError) {
        if (statusError.status !== 409) throw statusError;
      }
      const path = `${FileSystem.cacheDirectory}assinatura_${os_id}_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(path, dataUrl.replace(/^data:image\/png;base64,/, ''), { encoding: FileSystem.EncodingType.Base64 });
      await api.uploadFoto(os_id, 'ASSINATURA', { uri: path, name: `assinatura_${os_id}.png`, type: 'image/png' });
      const resposta = await api.chamadaAutenticada(`/os/${os_id}/status`, 'PATCH', { novo_status: 'FINALIZADA' });
      Alert.alert('O.S. finalizada', resposta.pdf_url ? 'Assinatura salva e PDF gerado.' : 'Assinatura salva com sucesso.', [{ text: 'Voltar à agenda', onPress: () => navigation.popToTop() }]);
    } catch (error) { Alert.alert('Não foi possível finalizar', error.message); }
    finally { setLoading(false); }
  };
  return <View style={styles.container}>
    <View style={styles.heading}><View style={styles.icon}><Ionicons name="create-outline" size={27} color={colors.primary} /></View><Text style={styles.title}>Assinatura do cliente</Text><Text style={styles.subtitle}>Ao assinar, o cliente confirma a execução dos serviços descritos nesta ordem.</Text></View>
    <View style={styles.progress}><View style={styles.progressDone} /><View style={styles.progressDone} /><View style={styles.progressDone} /><Text style={styles.progressText}>Etapa 3 de 3</Text></View>
    <View style={styles.canvasCard}><Text style={styles.canvasLabel}>ASSINE NO CAMPO ABAIXO</Text><View style={styles.canvas}><SignatureScreen ref={signature} onOK={finalizar} onEmpty={() => Alert.alert('Assinatura', 'Solicite a assinatura do cliente.')} webStyle={webStyle} /></View><View style={styles.line} /><Text style={styles.signHere}>Assinatura do responsável</Text></View>
    <View style={styles.actions}><TouchableOpacity style={styles.clear} onPress={() => signature.current?.clearSignature()} disabled={loading}><Ionicons name="refresh-outline" size={19} color={colors.text} /><Text style={styles.clearText}>Limpar</Text></TouchableOpacity><TouchableOpacity style={styles.finish} onPress={() => signature.current?.readSignature()} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle-outline" size={21} color="#fff" /><Text style={styles.white}>Finalizar O.S.</Text></>}</TouchableOpacity></View>
  </View>;
}
const webStyle = `.m-signature-pad{box-shadow:none;border:none}.m-signature-pad--body{border:1px solid #cbd5e1}.m-signature-pad--footer{display:none}`;
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.background }, heading: { alignItems: 'center', marginBottom: 14 }, icon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#E4F4F8', alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 10 }, subtitle: { textAlign: 'center', color: colors.muted, lineHeight: 19, marginTop: 5, paddingHorizontal: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 13 }, progressDone: { height: 5, flex: 1, borderRadius: 3, backgroundColor: colors.success }, progressText: { color: colors.muted, fontSize: 11, marginLeft: 5 },
  canvasCard: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 13, borderWidth: 1, borderColor: colors.border, ...shadow }, canvasLabel: { color: colors.muted, fontWeight: '800', fontSize: 10, letterSpacing: .8, marginBottom: 8 }, canvas: { flex: 1, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' }, line: { height: 1, backgroundColor: colors.text, marginHorizontal: 24 }, signHere: { color: colors.muted, textAlign: 'center', fontSize: 11, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 }, clear: { flex: .75, minHeight: 55, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, clearText: { color: colors.text, fontWeight: '800' },
  finish: { flex: 1.25, minHeight: 55, backgroundColor: colors.success, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, white: { color: '#fff', fontWeight: '800' },
});
