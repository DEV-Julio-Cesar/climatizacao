import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, Vibration, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { colors, shadow } from '../../styles/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function PerfilScreen({ onLogout, navigation }) {
  const { preferencias, atualizarPreferencia } = useApp();
  const [usuario, setUsuario] = useState({});
  const [localizacao, setLocalizacao] = useState(null);

  useEffect(() => {
    SecureStore.getItemAsync('climasaas_usuario').then((value) => value && setUsuario(JSON.parse(value))).catch(() => {});
  }, []);

  const obterLocalizacao = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permissão necessária', 'Autorize a localização para registrar a posição do atendimento.');
    const atual = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const dados = { latitude: atual.coords.latitude, longitude: atual.coords.longitude, data: new Date().toISOString() };
    setLocalizacao(dados);
    await AsyncStorage.setItem('@climasaas/ultima_localizacao', JSON.stringify(dados));
    if (preferencias.vibracao) Vibration.vibrate(120);
  };

  const testarNotificacao = async () => {
    if (!preferencias.notificacoes) return Alert.alert('Notificações desativadas', 'Ative a preferência antes de realizar o teste.');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permissão necessária', 'Habilite notificações nas configurações do aparelho.');
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('atendimentos', { name: 'Atendimentos', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 150, 200] });
    await Notifications.scheduleNotificationAsync({ content: { title: 'ClimaSaaS', body: 'Lembrete de atendimento configurado com sucesso!', sound: true }, trigger: null });
    if (preferencias.vibracao) Vibration.vibrate([0, 120, 80, 120]);
  };

  const sair = async () => {
    await SecureStore.deleteItemAsync('climasaas_token');
    await SecureStore.deleteItemAsync('climasaas_usuario');
    onLogout();
  };

  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.profile}><View style={styles.avatar}><Ionicons name="person" size={30} color="#fff" /></View><View><Text style={styles.name}>{usuario.nome || 'Técnico ClimaSaaS'}</Text><Text style={styles.email}>{usuario.email || 'Usuário autenticado'}</Text></View></View>

    <Text style={styles.sectionTitle}>Preferências do aplicativo</Text>
    <View style={styles.card}>
      <Row icon="notifications-outline" title="Notificações" subtitle="Alertas e lembretes de visitas"><Switch value={preferencias.notificacoes} onValueChange={(value) => atualizarPreferencia('notificacoes', value)} trackColor={{ true: colors.primary }} /></Row>
      <View style={styles.divider} />
      <Row icon="phone-portrait-outline" title="Vibração" subtitle="Confirmações táteis nas ações"><Switch value={preferencias.vibracao} onValueChange={(value) => atualizarPreferencia('vibracao', value)} trackColor={{ true: colors.primary }} /></Row>
    </View>

    <Text style={styles.sectionTitle}>Recursos do dispositivo</Text>
    <View style={styles.card}>
      <Info label="Sistema operacional" value={`${Platform.OS} ${Device.osVersion || ''}`} />
      <Info label="Marca e modelo" value={`${Device.brand || 'Não informada'} · ${Device.modelName || 'Não informado'}`} />
      <Info label="Tipo" value={Device.deviceType === Device.DeviceType.PHONE ? 'Celular' : Device.deviceType === Device.DeviceType.TABLET ? 'Tablet' : 'Outro / emulador'} />
      <Info label="Dispositivo real" value={Device.isDevice ? 'Sim' : 'Emulador'} />
    </View>

    <TouchableOpacity style={styles.action} onPress={obterLocalizacao}><Ionicons name="location-outline" size={22} color="#fff" /><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Registrar localização atual</Text><Text style={styles.actionSubtitle}>{localizacao ? `${localizacao.latitude.toFixed(5)}, ${localizacao.longitude.toFixed(5)}` : 'Usa o GPS do aparelho'}</Text></View></TouchableOpacity>
    <TouchableOpacity style={[styles.action, styles.secondary]} onPress={testarNotificacao}><Ionicons name="notifications-outline" size={22} color={colors.primary} /><Text style={styles.secondaryText}>Testar notificação e vibração</Text></TouchableOpacity>
    <TouchableOpacity style={[styles.action, styles.secondary]} onPress={()=>navigation.navigate('Sincronizacao')}><Ionicons name="cloud-upload-outline" size={22} color={colors.primary} /><Text style={styles.secondaryText}>Central de sincronização offline</Text></TouchableOpacity>
    <TouchableOpacity style={styles.link} onPress={() => Linking.openURL('https://climasaas-api.onrender.com/privacidade')}><Ionicons name="open-outline" size={18} color={colors.primary} /><Text style={styles.linkText}>Política de privacidade</Text></TouchableOpacity>
    <TouchableOpacity style={styles.logout} onPress={sair}><Ionicons name="log-out-outline" size={20} color={colors.danger} /><Text style={styles.logoutText}>Sair da conta</Text></TouchableOpacity>
  </ScrollView>;
}

function Row({ icon, title, subtitle, children }) { return <View style={styles.row}><Ionicons name={icon} size={23} color={colors.primary} /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>{children}</View>; }
function Info({ label, value }) { return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 38 }, profile: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.navy, borderRadius: 20, padding: 18, ...shadow }, avatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, name: { color: '#fff', fontWeight: '800', fontSize: 18 }, email: { color: '#CDEAF2', marginTop: 3 }, sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 23, marginBottom: 9 }, card: { backgroundColor: '#fff', borderRadius: 17, padding: 15, borderWidth: 1, borderColor: colors.border }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, rowTitle: { color: colors.text, fontWeight: '700' }, rowSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 }, divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 }, info: { marginBottom: 11 }, infoLabel: { color: colors.muted, fontSize: 12 }, infoValue: { color: colors.text, fontWeight: '700', marginTop: 2 }, action: { marginTop: 14, borderRadius: 15, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primary }, actionTitle: { color: '#fff', fontWeight: '800' }, actionSubtitle: { color: '#D6F0F5', fontSize: 12, marginTop: 2 }, secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }, secondaryText: { color: colors.primary, fontWeight: '800' }, link: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 22 }, linkText: { color: colors.primary, fontWeight: '700' }, logout: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 22, padding: 12 }, logoutText: { color: colors.danger, fontWeight: '800' },
});
