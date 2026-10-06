import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

export default function DetalhesOS({ route, navigation }) {
  const { os_id } = route.params; const [os, setOs] = useState(null); const [loading, setLoading] = useState(true);
  const carregar = useCallback(() => api.chamadaAutenticada(`/os/${os_id}`).then(setOs).catch((e) => Alert.alert('O.S.', e.message)).finally(() => setLoading(false)), [os_id]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const iniciar = async () => {
    try { if (os.status === 'ABERTA') await api.chamadaAutenticada(`/os/${os.id}/status`, 'PATCH', { novo_status: 'EM_ANDAMENTO' }); navigation.navigate('CameraOS', { os_id: os.id, tipo: 'ANTES' }); }
    catch (e) { Alert.alert('Atendimento', e.message); }
  };
  if (loading || !os) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  const equipamento = [os.aparelho_marca, os.aparelho_modelo, os.aparelho_capacidade].filter(Boolean).join(' · ') || 'Não vinculado';
  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.hero}><Text style={styles.order}>ORDEM DE SERVIÇO #{String(os.id).padStart(4, '0')}</Text><Text style={styles.title}>{os.tipo_servico.replaceAll('_', ' ')}</Text><View style={styles.status}><View style={styles.dot} /><Text style={styles.statusText}>{os.status.replaceAll('_', ' ')}</Text></View></View>
    <View style={styles.card}><Text style={styles.heading}>Cliente e local</Text><Row icon="person-outline" title={os.cliente_nome} text={os.cliente_telefone || 'Sem telefone'} /><Row icon="location-outline" title={os.cliente_endereco || 'Endereço não informado'} />
      <View style={styles.quick}><TouchableOpacity style={styles.quickButton} onPress={() => os.cliente_telefone && Linking.openURL(`tel:${os.cliente_telefone}`)}><Ionicons name="call-outline" size={19} color={colors.primary} /><Text style={styles.quickText}>Ligar</Text></TouchableOpacity><TouchableOpacity style={styles.quickButton} onPress={() => os.cliente_telefone && Linking.openURL(`https://wa.me/${os.cliente_telefone.replace(/\D/g, '')}`)}><Ionicons name="logo-whatsapp" size={19} color={colors.success} /><Text style={styles.quickText}>WhatsApp</Text></TouchableOpacity><TouchableOpacity style={styles.quickButton} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.cliente_endereco || '')}`)}><Ionicons name="navigate-outline" size={19} color={colors.primary} /><Text style={styles.quickText}>Rota</Text></TouchableOpacity></View>
    </View>
    <View style={styles.card}><Text style={styles.heading}>Equipamento</Text><Row icon="snow-outline" title={equipamento} text={`Patrimônio vinculado à O.S. #${os.id}`} /></View>
    <View style={styles.card}><Text style={styles.heading}>Solicitação do cliente</Text><Text style={styles.description}>{os.descricao_problema}</Text></View>
    <View style={styles.card}><Text style={styles.heading}>Histórico do equipamento</Text>{os.historico_equipamento.length ? os.historico_equipamento.map((h) => <View key={h.id} style={styles.history}><View><Text style={styles.historyTitle}>O.S. #{h.id} · {h.tipo_servico.replaceAll('_', ' ')}</Text><Text style={styles.historyText}>{h.diagnostico || 'Sem diagnóstico registrado'}</Text></View><Ionicons name="checkmark-circle" size={20} color={colors.success} /></View>) : <Text style={styles.empty}>Este é o primeiro atendimento registrado neste equipamento.</Text>}</View>
    <TouchableOpacity style={styles.start} onPress={iniciar}><Ionicons name="play-circle-outline" size={23} color="#fff" /><Text style={styles.startText}>{os.status === 'ABERTA' ? 'Iniciar atendimento' : 'Continuar atendimento'}</Text></TouchableOpacity>
  </ScrollView>;
}
function Row({ icon, title, text }) { return <View style={styles.row}><View style={styles.rowIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text>{text && <Text style={styles.rowText}>{text}</Text>}</View></View>; }
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, paddingBottom: 35 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, hero: { backgroundColor: colors.navy, borderRadius: 20, padding: 20, marginBottom: 13, ...shadow }, order: { color: '#9CC9D7', fontSize: 11, fontWeight: '800', letterSpacing: .8 }, title: { color: '#fff', fontSize: 24, fontWeight: '900', marginVertical: 9 }, status: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning }, statusText: { color: '#DDECF1', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 17, marginBottom: 13, borderWidth: 1, borderColor: colors.border, ...shadow }, heading: { color: colors.text, fontWeight: '900', fontSize: 16, marginBottom: 13 }, row: { flexDirection: 'row', gap: 11, alignItems: 'center', marginVertical: 6 }, rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#E8F4F7', alignItems: 'center', justifyContent: 'center' }, rowTitle: { color: colors.text, fontWeight: '700' }, rowText: { color: colors.muted, fontSize: 12, marginTop: 2 }, quick: { flexDirection: 'row', gap: 8, marginTop: 14 }, quickButton: { flex: 1, backgroundColor: colors.background, borderRadius: 11, paddingVertical: 10, alignItems: 'center', gap: 4 }, quickText: { color: colors.text, fontSize: 11, fontWeight: '700' }, description: { color: colors.muted, lineHeight: 21 }, history: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#EDF2F4' }, historyTitle: { color: colors.text, fontWeight: '700', fontSize: 12 }, historyText: { color: colors.muted, fontSize: 11, marginTop: 3, maxWidth: 270 }, empty: { color: colors.muted, fontStyle: 'italic' }, start: { minHeight: 58, borderRadius: 16, backgroundColor: colors.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, ...shadow }, startText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
