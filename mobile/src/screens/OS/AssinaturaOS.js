import { useScreenStyles } from '../../styles/useScreenStyles';
import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { tentarSincronizarOffline } from '../../services/SyncService';
import { enfileirarLote, listarFila } from '../../database/sqlite';

export default function AssinaturaOS({ route, navigation }) { const { colors, styles: styles } = useScreenStyles(createStyles);
  const { os_id } = route.params;
  const signature = useRef();
  const [loading, setLoading] = useState(false);
  const [nomeAssinante,setNomeAssinante]=useState('');
  const [salvo,setSalvo]=useState(false);
  const enviando=useRef(false);

  const finalizarComPosicao = async (dataUrl) => {
    if (enviando.current || salvo) return;
    const nome = nomeAssinante.trim().replace(/\s+/g, ' ');
    if (nome.length < 3 || nome.length > 150 || /[\x00-\x1f\x7f]/.test(nome)) return Alert.alert('Nome necessario', 'Informe o nome de quem esta assinando.');
    enviando.current = true; setLoading(true);
    let path, gravado = false;
    try {
      const usuario=JSON.parse(await SecureStore.getItemAsync('climasaas_usuario')||'null');
      if(!usuario?.id||!usuario?.empresa_id)throw new Error('Entre novamente para salvar o atendimento.');
      const conta=`${usuario.empresa_id}:${usuario.id}`;
      if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Assinatura invalida. Limpe o quadro e assine novamente.');
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (permissao.status !== 'granted') throw new Error('Autorize a localizacao para registrar o check-out.');
      const posicao = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      path = `${FileSystem.documentDirectory}assinatura_${os_id}_${Crypto.randomUUID()}.png`;
      await FileSystem.writeAsStringAsync(path, dataUrl.replace(/^data:image\/png;base64,/, ''), { encoding: FileSystem.EncodingType.Base64 });
      const coordenadas = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude };
      const ids = await enfileirarLote([
        { tipo: 'FOTO_OS', payload: { os_id, tipo: 'ASSINATURA', uri: path, nome: `assinatura_${os_id}.png`, mime: 'image/png', metadados: { assinante_nome: nome, capturada_em: new Date().toISOString(), ...coordenadas } } },
        { tipo: 'EVENTO_OS', payload: { os_id, dados: { evento: 'CHECKOUT', ...coordenadas } } },
        { tipo: 'STATUS_OS', payload: { os_id, novo_status: 'FINALIZADA' } },
      ],conta);
      gravado = true; setSalvo(true);
      await tentarSincronizarOffline().catch(() => {});
      let pendente = true;
      try { pendente = (await listarFila()).some(item => ids.includes(item.id)); } catch {}
      Alert.alert(pendente ? 'Atendimento salvo no aparelho' : 'O.S. finalizada',
        pendente ? 'Assinatura e finalizacao foram preservadas. Consulte a central de sincronizacao para acompanhar o envio.' : 'Assinatura e nome salvos. O relatorio sera gerado em seguida.',
        [{ text: 'Voltar a agenda', onPress: () => navigation.popToTop() }]);
    } catch (error) {
      Alert.alert(gravado ? 'Atendimento preservado' : 'Nao foi possivel finalizar', gravado ? 'Os registros estao na central de sincronizacao.' : error.message);
    } finally {
      if (!gravado && path) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
      enviando.current = false; setLoading(false);
    }
  };

  const confirmar = () => {
    if(nomeAssinante.trim().replace(/\s+/g,' ').length<3)return Alert.alert('Nome necessario','Informe o nome de quem esta assinando.');
    Alert.alert(
      'Finalizar atendimento',
      'A assinatura será salva, o check-out será registrado por GPS e a O.S. será encerrada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => signature.current?.readSignature() },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <Ionicons name="create-outline" size={27} color={colors.primary} />
        </View>
        <Text style={styles.title}>Assinatura do cliente</Text>
        <Text style={styles.subtitle}>
          Ao assinar, o cliente confirma a execução dos serviços descritos nesta ordem.
        </Text>
      </View>

      <View style={styles.progress}>
        <View style={styles.progressDone} />
        <View style={styles.progressDone} />
        <View style={styles.progressDone} />
        <Text style={styles.progressText}>Etapa 3 de 3</Text>
      </View>

      <View style={styles.canvasCard}>
        <Text style={styles.canvasLabel}>NOME DE QUEM ASSINA</Text><TextInput accessibilityLabel="Nome do responsavel pela assinatura" style={styles.nomeInput} placeholder="Nome completo" placeholderTextColor={colors.muted} value={nomeAssinante} onChangeText={setNomeAssinante} autoCapitalize="words" maxLength={150} editable={!loading&&!salvo}/><Text style={styles.canvasLabel}>ASSINE NO CAMPO ABAIXO</Text>
        <View style={styles.canvas}>
          <SignatureScreen
            ref={signature}
            onOK={finalizarComPosicao}
            onEmpty={() => Alert.alert('Assinatura', 'Solicite a assinatura do cliente.')}
            webStyle={webStyle}
          />
        </View>
        <View style={styles.line} />
        <Text style={styles.signHere}>Assinatura do responsável</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.clear}
          onPress={() => signature.current?.clearSignature()}
          disabled={loading||salvo}
        >
          <Ionicons name="refresh-outline" size={19} color={colors.text} />
          <Text style={styles.clearText}>Limpar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.finish}
          onPress={confirmar}
          disabled={loading||salvo}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="checkmark-circle-outline" size={21} color="#fff" />
                <Text style={styles.white}>Finalizar O.S.</Text>
              </>
            )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const webStyle = `.m-signature-pad{box-shadow:none;border:none}.m-signature-pad--body{border:1px solid #cbd5e1}.m-signature-pad--footer{display:none}`;

const createStyles = (colors, shadow) => StyleSheet.create({
  nomeInput: { color: colors.text, backgroundColor: colors.surfaceAlt, borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:12 },
  container: { flex: 1, padding: 16, backgroundColor: colors.background },
  heading: { alignItems: 'center', marginBottom: 14 },
  icon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 10 },
  subtitle: { textAlign: 'center', color: colors.muted, lineHeight: 19, marginTop: 5, paddingHorizontal: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 13 },
  progressDone: { height: 5, flex: 1, borderRadius: 3, backgroundColor: colors.success },
  progressText: { color: colors.muted, fontSize: 11, marginLeft: 5 },
  canvasCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 13, borderWidth: 1, borderColor: colors.border, ...shadow },
  canvasLabel: { color: colors.muted, fontWeight: '800', fontSize: 10, letterSpacing: .8, marginBottom: 8 },
  canvas: { flex: 1, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  line: { height: 1, backgroundColor: colors.text, marginHorizontal: 24 },
  signHere: { color: colors.muted, textAlign: 'center', fontSize: 11, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  clear: { flex: .75, minHeight: 55, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  clearText: { color: colors.text, fontWeight: '800' },
  finish: { flex: 1.25, minHeight: 55, backgroundColor: colors.success, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  white: { color: '#fff', fontWeight: '800' },
});
