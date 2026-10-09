import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl, TextInput, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../services/api';
import { tentarSincronizarOffline } from '../../services/SyncService';
import { lerCache, salvarCache } from '../../database/sqlite';
import { colors, shadow } from '../../styles/theme';

const statusConfig = {
  ABERTA: { label: 'Aguardando', color: colors.primary, background: '#E5F5FA' },
  EM_ANDAMENTO: { label: 'Em atendimento', color: '#A86600', background: '#FFF2D8' },
};
export default function Agenda({ navigation, onLogout }) {
  const [ordens, setOrdens] = useState([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState('HOJE'); const [busca, setBusca] = useState('');
  const carregar = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try { await tentarSincronizarOffline(); const dados = await api.chamadaAutenticada(`/os/agenda?filtro=${filtro}&busca=${encodeURIComponent(busca.trim())}`); setOrdens(dados); await salvarCache(`agenda_${filtro}_${busca.trim()}`,dados); }
    catch (error) { const cache=await lerCache(`agenda_${filtro}_${busca.trim()}`); if(cache) setOrdens(cache.dados); else Alert.alert('Não foi possível carregar', error.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filtro, busca]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => { navigation.setOptions({ headerRight: () => <View style={{flexDirection:'row'}}><TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('MapaRota')}><Ionicons name="map-outline" size={22} color="#fff" /></TouchableOpacity><TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('Notificacoes')}><Ionicons name="notifications-outline" size={22} color="#fff" /></TouchableOpacity><TouchableOpacity style={styles.headerButton} onPress={async () => { await SecureStore.deleteItemAsync('climasaas_token'); onLogout(); }}><Ionicons name="log-out-outline" size={22} color="#fff" /></TouchableOpacity></View> }); }, [navigation, onLogout]);
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loading}>Organizando sua agenda...</Text></View>;
  return <View style={styles.container}>
    <FlatList data={ordens} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} colors={[colors.primary]} />}
      ListHeaderComponent={<><LinearGradient colors={[colors.primaryDark, colors.primary]} style={styles.hero}>
        <View style={{ flex: 1 }}><Text style={styles.greeting}>Olá, técnico</Text><Text style={styles.heroTitle}>Sua rota de hoje</Text><View style={styles.heroLinks}><TouchableOpacity style={styles.historyLink} onPress={() => navigation.navigate('Finalizadas')}><Ionicons name="archive-outline" size={16} color="#fff" /><Text style={styles.historyText}>Finalizadas</Text></TouchableOpacity><TouchableOpacity style={styles.historyLink} onPress={() => navigation.navigate('Clientes')}><Ionicons name="people-outline" size={16} color="#fff" /><Text style={styles.historyText}>Clientes</Text></TouchableOpacity><TouchableOpacity style={styles.historyLink} onPress={() => navigation.navigate('Gestao')}><Ionicons name="stats-chart-outline" size={16} color="#fff" /><Text style={styles.historyText}>Gestão</Text></TouchableOpacity></View></View>
        <View style={styles.counter}><Text style={styles.counterNumber}>{ordens.length}</Text><Text style={styles.counterLabel}>visitas</Text></View>
      </LinearGradient><View style={styles.searchWrap}><Ionicons name="search-outline" size={19} color={colors.muted} /><TextInput style={styles.searchInput} value={busca} onChangeText={setBusca} onSubmitEditing={() => carregar()} placeholder="Cliente, endereço ou número da O.S." returnKeyType="search" /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>{[['HOJE','Hoje'],['ATRASADAS','Atrasadas'],['PROXIMAS','Próximas'],['TODAS','Todas abertas']].map(([value,label]) => <TouchableOpacity key={value} style={[styles.filter, filtro === value && styles.filterActive]} onPress={() => setFiltro(value)}><Text style={[styles.filterText, filtro === value && styles.filterTextActive]}>{label}</Text></TouchableOpacity>)}</ScrollView></>}
      ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="checkmark-done" size={34} color={colors.success} /></View><Text style={styles.emptyTitle}>Tudo em dia!</Text><Text style={styles.emptyText}>Nenhuma visita pendente na sua agenda.</Text></View>}
      renderItem={({ item, index }) => {
        const badge = statusConfig[item.status] || statusConfig.ABERTA;
        return <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('DetalhesOS', { os_id: item.id })} activeOpacity={0.8}>
          <View style={styles.timeline}><Text style={styles.order}>#{String(item.id).padStart(4, '0')}</Text><View style={[styles.badge, { backgroundColor: badge.background }]}><View style={[styles.dot, { backgroundColor: badge.color }]} /><Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text></View></View>
          <Text style={styles.service}>{item.tipo_servico.replaceAll('_', ' ')}</Text>
          <View style={styles.info}><Ionicons name="person-outline" size={17} color={colors.muted} /><Text style={styles.infoText}>{item.cliente_nome}</Text></View>
          <View style={styles.info}><Ionicons name="location-outline" size={17} color={colors.muted} /><Text style={styles.infoText} numberOfLines={1}>{item.endereco || 'Endereço não informado'}</Text></View>
          <View style={styles.divider} /><View style={styles.cardFooter}><Text style={styles.action}>Ver detalhes do atendimento</Text><View style={styles.arrow}><Ionicons name="arrow-forward" size={17} color="#fff" /></View></View>
        </TouchableOpacity>;
      }}
    />
    <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NovaOS')} activeOpacity={0.85}><Ionicons name="add" size={25} color="#fff" /><Text style={styles.fabText}>Nova O.S.</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }, loading: { marginTop: 12, color: colors.muted }, list: { padding: 16, paddingBottom: 105 },
  headerButton: { padding: 7 }, hero: { borderRadius: 20, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, ...shadow }, greeting: { color: '#CBEAF2', fontSize: 13 }, heroTitle: { color: '#fff', fontWeight: '800', fontSize: 23, marginTop: 3 }, counter: { width: 70, height: 70, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.14)', alignItems: 'center', justifyContent: 'center' }, counterNumber: { color: '#fff', fontWeight: '900', fontSize: 25 }, counterLabel: { color: '#D6F0F5', fontSize: 11 },
  heroLinks:{flexDirection:'row',gap:7,marginTop:15}, historyLink: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 7 }, historyText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  card: { backgroundColor: '#fff', padding: 17, borderRadius: 18, marginBottom: 13, borderWidth: 1, borderColor: colors.border, ...shadow }, timeline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, order: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: .7 }, badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }, dot: { width: 6, height: 6, borderRadius: 3 }, badgeText: { fontSize: 11, fontWeight: '800' },
  service: { color: colors.text, fontSize: 18, fontWeight: '800', marginVertical: 13 }, info: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }, infoText: { color: colors.muted, flex: 1 }, divider: { height: 1, backgroundColor: '#EDF2F4', marginVertical: 14 }, cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, action: { color: colors.primary, fontWeight: '800' }, arrow: { backgroundColor: colors.primary, width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 }, emptyIcon: { width: 70, height: 70, borderRadius: 25, backgroundColor: '#E3F7F1', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { fontWeight: '800', fontSize: 20, color: colors.text, marginTop: 15 }, emptyText: { color: colors.muted, marginTop: 4 },
  searchWrap:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,borderRadius:13,paddingHorizontal:12,marginBottom:10},searchInput:{flex:1,paddingVertical:12,color:colors.text},filters:{marginBottom:16},filter:{paddingHorizontal:14,paddingVertical:9,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,marginRight:8},filterActive:{backgroundColor:colors.primary,borderColor:colors.primary},filterText:{color:colors.muted,fontWeight:'700',fontSize:12},filterTextActive:{color:'#fff'},
  fab: { position: 'absolute', right: 18, bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.primary, paddingVertical: 15, paddingHorizontal: 20, borderRadius: 18, ...shadow }, fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
