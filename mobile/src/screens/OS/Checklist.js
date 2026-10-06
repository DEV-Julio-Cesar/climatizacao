import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { salvarOsLocal } from '../../database/sqlite';
import { colors, shadow } from '../../styles/theme';

const TIPOS = ['LIMPEZA', 'INSTALACAO', 'REMOCAO', 'PREVENTIVA', 'PROBLEMA_TECNICO'];
export default function Checklist({ navigation }) {
  const [clientes, setClientes] = useState([]); const [cliente, setCliente] = useState(null);
  const [aparelho, setAparelho] = useState(null); const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState(''); const [loading, setLoading] = useState(false);
  useEffect(() => { api.chamadaAutenticada('/clientes').then(setClientes).catch((e) => Alert.alert('Clientes', e.message)); }, []);
  const selecionarCliente = (item) => { setCliente(item); setAparelho(item.aparelhos?.[0] || null); };
  const salvar = async () => {
    if (!cliente || !tipo || descricao.trim().length < 5) return Alert.alert('Atenção', 'Selecione cliente, serviço e descreva o atendimento.');
    const payload = { cliente_id: cliente.id, aparelho_id: aparelho?.id || null, tipo_servico: tipo, descricao_problema: descricao.trim() };
    setLoading(true);
    try {
      const rede = await Network.getNetworkStateAsync();
      if (!rede.isConnected || rede.isInternetReachable === false) {
        await salvarOsLocal(payload); Alert.alert('Salvo offline', 'A O.S. será criada quando a conexão voltar.'); navigation.goBack(); return;
      }
      const resposta = await api.chamadaAutenticada('/os', 'POST', payload);
      await api.chamadaAutenticada(`/os/${resposta.os.id}/status`, 'PATCH', { novo_status: 'EM_ANDAMENTO' });
      navigation.replace('CameraOS', { os_id: resposta.os.id, tipo: 'ANTES' });
    } catch (error) { Alert.alert('Falha ao salvar', error.message); }
    finally { setLoading(false); }
  };
  const Section = ({ number, icon, title, children }) => <View style={styles.section}><View style={styles.sectionHeader}><View style={styles.number}><Text style={styles.numberText}>{number}</Text></View><Ionicons name={icon} size={20} color={colors.primary} /><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
  return <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.intro}><Text style={styles.introTitle}>Novo atendimento</Text><Text style={styles.introText}>Preencha os dados abaixo para iniciar uma ordem de serviço.</Text></View>
    <Section number="1" icon="person-outline" title="Escolha o cliente"><View style={styles.chips}>{clientes.map((item) => <TouchableOpacity key={item.id} style={[styles.chip, cliente?.id === item.id && styles.active]} onPress={() => selecionarCliente(item)}><Ionicons name={cliente?.id === item.id ? 'checkmark-circle' : 'person-circle-outline'} size={18} color={cliente?.id === item.id ? '#fff' : colors.muted} /><Text style={[styles.chipText, cliente?.id === item.id && styles.activeText]}>{item.nome}</Text></TouchableOpacity>)}</View></Section>
    {cliente?.aparelhos?.length > 0 && <Section number="2" icon="snow-outline" title="Equipamento"><View style={styles.chips}>{cliente.aparelhos.map((item) => <TouchableOpacity key={item.id} style={[styles.chip, aparelho?.id === item.id && styles.active]} onPress={() => setAparelho(item)}><Text style={[styles.chipText, aparelho?.id === item.id && styles.activeText]}>{item.marca} {item.modelo}</Text></TouchableOpacity>)}</View></Section>}
    <Section number="3" icon="construct-outline" title="Tipo de serviço"><View style={styles.chips}>{TIPOS.map((item) => <TouchableOpacity key={item} style={[styles.serviceChip, tipo === item && styles.active]} onPress={() => setTipo(item)}><Text style={[styles.chipText, tipo === item && styles.activeText]}>{item.replaceAll('_', ' ')}</Text></TouchableOpacity>)}</View></Section>
    <Section number="4" icon="document-text-outline" title="Descrição e diagnóstico"><TextInput style={styles.input} multiline value={descricao} onChangeText={setDescricao} placeholder="Conte o que foi identificado ou precisa ser realizado..." placeholderTextColor="#9AAAB3" /><Text style={styles.counter}>{descricao.length}/1000</Text></Section>
    <TouchableOpacity style={styles.button} onPress={salvar} disabled={loading} activeOpacity={0.85}>{loading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="camera-outline" size={21} color="#fff" /><Text style={styles.buttonText}>Criar O.S. e registrar fotos</Text></>}</TouchableOpacity>
  </ScrollView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, paddingBottom: 35 }, intro: { marginBottom: 17 }, introTitle: { fontSize: 24, fontWeight: '900', color: colors.text }, introText: { color: colors.muted, lineHeight: 20, marginTop: 4 },
  section: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 13, borderWidth: 1, borderColor: colors.border, ...shadow }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }, number: { width: 27, height: 27, borderRadius: 9, backgroundColor: '#E4F4F8', alignItems: 'center', justifyContent: 'center' }, numberText: { color: colors.primary, fontWeight: '900', fontSize: 12 }, sectionTitle: { fontWeight: '800', color: colors.text, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 13, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 13 }, serviceChip: { paddingVertical: 11, paddingHorizontal: 13, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 13 }, chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  active: { backgroundColor: colors.primary, borderColor: colors.primary }, activeText: { color: '#fff' }, input: { minHeight: 120, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 13, color: colors.text, textAlignVertical: 'top' }, counter: { textAlign: 'right', color: colors.muted, fontSize: 11, marginTop: 6 },
  button: { backgroundColor: colors.success, minHeight: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 7, flexDirection: 'row', gap: 9, ...shadow }, buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
