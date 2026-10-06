import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Linking, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, BASE_URL } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

function urlLocal(pdfUrl) {
  const file = pdfUrl?.split('/uploads/')[1];
  return file ? `${BASE_URL}/uploads/${file}` : null;
}

export default function Finalizadas() {
  const [ordens, setOrdens] = useState([]); const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const carregar = useCallback(async (termo = '') => {
    try { setOrdens(await api.chamadaAutenticada(`/os/finalizadas?busca=${encodeURIComponent(termo)}`)); }
    catch (error) { Alert.alert('Histórico', error.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { carregar(busca); }, [carregar]));

  const abrir = async (os) => {
    const url = urlLocal(os.pdf_url);
    if (!url) return Alert.alert('PDF indisponível', 'Esta O.S. ainda não possui um PDF gerado.');
    try { await Linking.openURL(url); } catch (error) { Alert.alert('PDF', 'Não foi possível abrir o documento.'); }
  };
  const compartilhar = async (os) => {
    const url = urlLocal(os.pdf_url);
    if (!url) return Alert.alert('PDF indisponível', 'Esta O.S. ainda não possui um PDF gerado.');
    try {
      const destino = `${FileSystem.cacheDirectory}OS_${os.id}.pdf`;
      const download = await FileSystem.downloadAsync(url, destino);
      if (!(await Sharing.isAvailableAsync())) return Linking.openURL(url);
      await Sharing.shareAsync(download.uri, { mimeType: 'application/pdf', dialogTitle: `Enviar O.S. #${os.id}`, UTI: 'com.adobe.pdf' });
    } catch (error) { Alert.alert('Compartilhamento', `Não foi possível baixar o PDF: ${error.message}`); }
  };
  const data = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-';
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  return <View style={styles.container}>
    <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.muted} /><TextInput value={busca} onChangeText={setBusca} onSubmitEditing={() => carregar(busca)} placeholder="Buscar por cliente ou número da O.S." placeholderTextColor="#94A3AD" style={styles.searchInput} returnKeyType="search" /><TouchableOpacity onPress={() => carregar(busca)}><Ionicons name="arrow-forward-circle" size={27} color={colors.primary} /></TouchableOpacity></View>
    <FlatList data={ordens} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(busca); }} colors={[colors.primary]} />}
      ListHeaderComponent={<View style={styles.summary}><View style={styles.summaryIcon}><Ionicons name="checkmark-done" size={26} color={colors.success} /></View><View><Text style={styles.summaryNumber}>{ordens.length} finalizadas</Text><Text style={styles.summaryText}>Documentos prontos para consultar e enviar</Text></View></View>}
      ListEmptyComponent={<View style={styles.empty}><Ionicons name="document-text-outline" size={45} color={colors.border} /><Text style={styles.emptyTitle}>Nenhuma O.S. encontrada</Text></View>}
      renderItem={({ item }) => <View style={styles.card}>
        <View style={styles.top}><View><Text style={styles.order}>O.S. #{String(item.id).padStart(4, '0')}</Text><Text style={styles.service}>{item.tipo_servico.replaceAll('_', ' ')}</Text></View><View style={styles.done}><Ionicons name="checkmark-circle" size={17} color={colors.success} /><Text style={styles.doneText}>Finalizada</Text></View></View>
        <View style={styles.info}><Ionicons name="person-outline" size={17} color={colors.muted} /><Text style={styles.infoText}>{item.cliente_nome}</Text></View>
        <View style={styles.info}><Ionicons name="calendar-outline" size={17} color={colors.muted} /><Text style={styles.infoText}>{data(item.finalizado_em)}</Text></View>
        <View style={styles.info}><Ionicons name="images-outline" size={17} color={colors.muted} /><Text style={styles.infoText}>{item.total_anexos} anexos · Técnico: {item.tecnico_nome}</Text></View>
        <View style={styles.actions}><TouchableOpacity style={styles.openButton} onPress={() => abrir(item)}><Ionicons name="eye-outline" size={19} color={colors.primary} /><Text style={styles.openText}>Abrir PDF</Text></TouchableOpacity><TouchableOpacity style={styles.shareButton} onPress={() => compartilhar(item)}><Ionicons name="share-social-outline" size={19} color="#fff" /><Text style={styles.shareText}>Enviar ao cliente</Text></TouchableOpacity></View>
      </View>}
    />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 4, paddingHorizontal: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 15, ...shadow }, searchInput: { flex: 1, paddingVertical: 14, color: colors.text }, list: { padding: 16, paddingTop: 12, paddingBottom: 30 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }, summaryIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#E4F7F1', alignItems: 'center', justifyContent: 'center' }, summaryNumber: { color: colors.text, fontSize: 18, fontWeight: '900' }, summaryText: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 17, marginBottom: 13, borderWidth: 1, borderColor: colors.border, ...shadow }, top: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, order: { color: colors.muted, fontSize: 11, fontWeight: '800' }, service: { color: colors.text, fontWeight: '900', fontSize: 17, marginTop: 5 }, done: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: '#E4F7F1', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 }, doneText: { color: colors.success, fontSize: 10, fontWeight: '800' },
  info: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 }, infoText: { color: colors.muted, flex: 1, fontSize: 13 }, actions: { flexDirection: 'row', gap: 9, marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EDF2F4' }, openButton: { flex: .85, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, openText: { color: colors.primary, fontWeight: '800', fontSize: 12 }, shareButton: { flex: 1.25, minHeight: 46, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, shareText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 70 }, emptyTitle: { color: colors.muted, fontWeight: '700', marginTop: 10 },
});
