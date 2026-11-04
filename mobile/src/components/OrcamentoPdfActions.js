import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/useTheme';
import { exportarOrcamentoPdf } from '../services/orcamentoPdf';

export default function OrcamentoPdfActions({ id }) {
  const { colors } = useTheme();
  const [acao, setAcao] = useState(null);
  const ocupado = useRef(false);
  const executar = async (tipo) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setAcao(tipo);
    try {
      const salvo = await exportarOrcamentoPdf(id, tipo);
      if (salvo) Alert.alert('PDF salvo', 'O orçamento foi salvo na pasta selecionada.');
    } catch (error) {
      Alert.alert('PDF do orçamento', error.message || 'Não foi possível gerar o PDF. Tente novamente.');
    } finally { ocupado.current = false; setAcao(null); }
  };
  return <View style={styles.container}>
    <Text style={[styles.title, { color: colors.text }]}>PDF do orçamento</Text>
    <Text style={{ color: colors.muted }}>Gere o documento para salvar ou enviar ao cliente. É necessário estar conectado.</Text>
    <View style={styles.buttons}>
      {['salvar', 'compartilhar'].map(tipo => <TouchableOpacity
        key={tipo} accessibilityRole="button" accessibilityState={{ disabled: !!acao, busy: acao === tipo }}
        disabled={!!acao} onPress={() => executar(tipo)}
        style={[styles.button, { backgroundColor: colors.primary, opacity: acao ? 0.6 : 1 }]}
      >
        {acao === tipo ? <ActivityIndicator color="#fff" /> : <Ionicons name={tipo === 'salvar' ? 'download-outline' : 'share-social-outline'} size={20} color="#fff" />}
        <Text style={styles.label}>{tipo === 'salvar' ? 'Salvar PDF' : 'Compartilhar'}</Text>
      </TouchableOpacity>)}
    </View>
    {Platform.OS === 'ios' && <Text style={{ color: colors.muted }}>Para salvar, escolha “Salvar em Arquivos” na janela de compartilhamento.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 18, gap: 10 },
  title: { fontSize: 18, fontWeight: '800' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, gap: 8 },
  label: { color: '#fff', fontWeight: '800' },
});
