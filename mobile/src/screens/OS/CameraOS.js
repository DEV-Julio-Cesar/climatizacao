import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, Text, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

export default function CameraOS({ route, navigation }) {
  const { os_id, tipo = 'ANTES' } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [foto, setFoto] = useState(null); const [loading, setLoading] = useState(false); const camera = useRef(null);
  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!permission.granted) return <View style={styles.center}><Text style={styles.permission}>A câmera é necessária para registrar o serviço.</Text><TouchableOpacity style={styles.smallButton} onPress={requestPermission}><Text style={styles.white}>Permitir câmera</Text></TouchableOpacity></View>;
  const capturar = async () => {
    try {
      const original = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (!original) return;
      setFoto(await ImageManipulator.manipulateAsync(original.uri, [{ resize: { width: 1200 } }], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }));
    } catch (error) { Alert.alert('Câmera', error.message); }
  };
  const enviar = async () => {
    setLoading(true);
    try {
      await api.uploadFoto(os_id, tipo, { uri: foto.uri, name: `os_${os_id}_${tipo.toLowerCase()}.jpg`, type: 'image/jpeg' });
      if (tipo === 'ANTES') navigation.replace('CameraOS', { os_id, tipo: 'DEPOIS' });
      else navigation.replace('ExecucaoOS', { os_id });
    } catch (error) { Alert.alert('Falha no upload', error.message); }
    finally { setLoading(false); }
  };
  const antes = tipo === 'ANTES';
  return <View style={styles.container}>
    <View style={styles.guide}><View style={styles.step}><Text style={styles.stepText}>{antes ? '1 de 3' : '2 de 3'}</Text></View><View style={{ flex: 1 }}><Text style={styles.label}>{antes ? 'Antes do serviço' : 'Depois do serviço'}</Text><Text style={styles.hint}>{antes ? 'Registre o estado inicial do equipamento.' : 'Mostre o resultado final do atendimento.'}</Text></View></View>
    {foto ? <><View style={styles.previewWrap}><Image source={{ uri: foto.uri }} style={styles.preview} /><View style={styles.check}><Ionicons name="checkmark" size={25} color="#fff" /></View></View><View style={styles.actions}><TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setFoto(null)}><Ionicons name="refresh" size={19} color={colors.text} /><Text style={styles.secondaryText}>Refazer</Text></TouchableOpacity><TouchableOpacity style={[styles.button, styles.green]} onPress={enviar} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.white}>Usar foto</Text><Ionicons name="arrow-forward" size={19} color="#fff" /></>}</TouchableOpacity></View></> : <View style={styles.cameraWrap}><CameraView style={styles.camera} facing="back" ref={camera} /><View pointerEvents="none" style={styles.frame}><View style={[styles.corner, styles.tl]} /><View style={[styles.corner, styles.tr]} /><View style={[styles.corner, styles.bl]} /><View style={[styles.corner, styles.br]} /></View><View style={styles.cameraFooter}><Text style={styles.cameraTip}>Centralize o equipamento no quadro</Text><TouchableOpacity accessibilityLabel="Tirar foto" style={styles.captureOuter} onPress={capturar}><View style={styles.capture} /></TouchableOpacity></View></View>}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 }, permission: { textAlign: 'center', marginBottom: 18, color: colors.text },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: colors.border }, step: { backgroundColor: '#E4F4F8', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }, stepText: { color: colors.primary, fontWeight: '900', fontSize: 12 }, label: { color: colors.text, fontSize: 17, fontWeight: '800' }, hint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  cameraWrap: { flex: 1, margin: 12, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000', ...shadow }, camera: { flex: 1 }, frame: { position: 'absolute', top: '16%', left: '9%', right: '9%', height: '48%' }, corner: { position: 'absolute', width: 35, height: 35, borderColor: '#fff' }, tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }, tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }, bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }, br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  cameraFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: 27 }, cameraTip: { color: '#fff', backgroundColor: 'rgba(0,0,0,.5)', borderRadius: 15, paddingHorizontal: 13, paddingVertical: 7, marginBottom: 18, fontSize: 12 }, captureOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, capture: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  previewWrap: { flex: 1, margin: 12, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.navy }, preview: { flex: 1, resizeMode: 'contain' }, check: { position: 'absolute', right: 15, top: 15, width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success },
  actions: { flexDirection: 'row', padding: 12, paddingBottom: 20, gap: 10 }, button: { flex: 1, minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }, secondaryText: { color: colors.text, fontWeight: '800' }, green: { backgroundColor: colors.success }, smallButton: { backgroundColor: colors.primary, padding: 14, borderRadius: 10 }, white: { color: '#fff', fontWeight: '800' },
});
