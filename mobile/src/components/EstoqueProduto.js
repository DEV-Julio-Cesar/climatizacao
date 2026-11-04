import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { api } from '../services/api';
import { prepararMovimento, saldoAposMovimento } from '../services/estoque';
import { useScreenStyles } from '../styles/useScreenStyles';

const tipos = { ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE: 'Ajuste de saldo' };
const numero = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export default function EstoqueProduto({ produto, podeGerenciar, podeVer, onClose, onAtualizado }) {
  const { colors, styles: s } = useScreenStyles(createStyles);
  const [dados, setDados] = useState({ ...produto, estoque: podeGerenciar ? produto.estoque : null, movimentacoes: [] });
  const [carregando, setCarregando] = useState(podeVer);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState(podeGerenciar ? 'movimento' : 'historico');
  const [tipo, setTipo] = useState('ENTRADA');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ocupado = useRef(false);
  const operacao = useRef(null);
  const ativo = useRef(true);
  const carregar = useCallback(async () => {
    if (!podeVer) return;
    setCarregando(true); setErro('');
    try {
      const resposta = await api.chamadaAutenticada(`/produtos/${produto.id}/movimentacoes`);
      if (ativo.current) setDados(resposta);
    } catch (e) { if (ativo.current) setErro(e.message); }
    finally { if (ativo.current) setCarregando(false); }
  }, [produto.id, podeVer]);
  useEffect(() => { ativo.current = true; void carregar(); return () => { ativo.current = false; }; }, [carregar]);

  const enviar = async movimento => {
    if (ocupado.current) return;
    ocupado.current = true; setSalvando(true);
    try {
      // Reutiliza a chave caso a resposta se perca e a pessoa tente os mesmos dados novamente.
      const fingerprint = JSON.stringify(movimento);
      if (operacao.current?.fingerprint !== fingerprint) operacao.current = { fingerprint, chave: Crypto.randomUUID() };
      const resultado = await api.chamadaAutenticada(`/produtos/${produto.id}/movimentar`, 'POST', movimento, 0, operacao.current.chave);
      operacao.current = null;
      setDados(anterior => ({ ...anterior, estoque: resultado.estoque }));
      setQuantidade(''); setMotivo('');
      onAtualizado(produto.id, resultado.estoque);
      Alert.alert('Estoque atualizado', `Novo saldo central: ${numero(resultado.estoque)} ${produto.unidade}.`);
      if (podeVer) { setAba('historico'); await carregar(); }
    } catch (e) {
      Alert.alert('Movimentação não confirmada', e.status === 0 ? `${e.message} Confira o histórico antes de alterar os dados ou iniciar outra operação.` : e.message);
    } finally { ocupado.current = false; if (ativo.current) setSalvando(false); }
  };
  const confirmar = () => {
    try {
      const movimento = prepararMovimento(tipo, quantidade, motivo);
      const previsto = saldoAposMovimento(dados.estoque, movimento);
      if (previsto < 0) throw new Error('A saída é maior que o saldo central. Atualize o histórico e revise a quantidade.');
      if (previsto > 9999999999.99) throw new Error('O saldo excede o limite permitido.');
      if (tipo === 'AJUSTE' && previsto === Number(dados.estoque)) throw new Error('O saldo informado já é o saldo atual.');
      Alert.alert('Confirmar movimentação', `${tipos[tipo]}: ${numero(movimento.quantidade)} ${produto.unidade}.\nSaldo previsto: ${numero(previsto)} ${produto.unidade}.\n\n${motivo.trim()}${tipo === 'AJUSTE' ? '\n\nO ajuste substitui o saldo central pelo valor informado.' : ''}`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => enviar(movimento) },
      ]);
    } catch (e) { Alert.alert('Revise a movimentação', e.message); }
  };

  return <Modal visible transparent animationType="slide" onRequestClose={() => { if (!ocupado.current) onClose(); }}>
    <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.sheet}>
        <View style={s.header}><Text style={s.title}>{produto.nome}</Text><TouchableOpacity accessibilityRole="button" disabled={salvando} onPress={onClose}><Text style={s.link}>Fechar</Text></TouchableOpacity></View>
        <Text style={s.saldo}>Saldo central: {dados.estoque === null ? '—' : numero(dados.estoque)} {produto.unidade}</Text>
        <View style={s.tabs}>
          {podeGerenciar && <TouchableOpacity disabled={salvando} onPress={() => setAba('movimento')} style={[s.tab, aba === 'movimento' && s.tabAtiva]}><Text style={s.tabText}>Movimentar</Text></TouchableOpacity>}
          {podeVer && <TouchableOpacity disabled={salvando} onPress={() => setAba('historico')} style={[s.tab, aba === 'historico' && s.tabAtiva]}><Text style={s.tabText}>Histórico</Text></TouchableOpacity>}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          {erro ? <View style={s.aviso}><Text style={s.erro}>{erro}</Text><TouchableOpacity disabled={salvando} onPress={carregar}><Text style={s.link}>Tentar novamente</Text></TouchableOpacity></View> : null}
          {carregando && <ActivityIndicator color={colors.primary} />}
          {aba === 'movimento' ? <>
            <Text style={s.label}>Operação no estoque central</Text>
            <View style={s.tabs}>{Object.entries(tipos).map(([valor, texto]) => <TouchableOpacity key={valor} disabled={salvando} onPress={() => { setTipo(valor); setQuantidade(''); }} style={[s.tab, tipo === valor && s.tabAtiva]}><Text style={s.tabText}>{texto}</Text></TouchableOpacity>)}</View>
            <Text style={s.help}>{tipo === 'AJUSTE' ? 'Informe o saldo final contado no inventário. Pode ser zero.' : tipo === 'SAIDA' ? 'Informe a quantidade a retirar. Materiais reservados ficam protegidos.' : 'Informe a quantidade recebida para somar ao saldo.'}</Text>
            <Text style={s.label}>{tipo === 'AJUSTE' ? 'Novo saldo' : 'Quantidade'}</Text>
            <TextInput accessibilityLabel={tipo === 'AJUSTE' ? 'Novo saldo' : 'Quantidade'} style={s.input} value={quantidade} onChangeText={setQuantidade} keyboardType="decimal-pad" editable={!salvando} placeholder="Ex.: 2,5" placeholderTextColor={colors.muted} />
            <Text style={s.label}>Motivo / observação *</Text>
            <TextInput accessibilityLabel="Motivo da movimentação" style={[s.input, { minHeight: 80 }]} value={motivo} onChangeText={setMotivo} maxLength={300} multiline editable={!salvando} placeholder="Ex.: compra recebida, avaria ou inventário" placeholderTextColor={colors.muted} />
            <TouchableOpacity accessibilityRole="button" disabled={salvando || carregando || !!erro} style={[s.confirmar, (salvando || carregando || !!erro) && { opacity: 0.5 }]} onPress={confirmar}>{salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.confirmarText}>Revisar e confirmar</Text>}</TouchableOpacity>
          </> : <>
            <Text style={s.help}>Últimas 200 movimentações do produto, incluindo operações de técnicos e ordens de serviço. Em ajustes, a quantidade representa o saldo definido.</Text>
            <TouchableOpacity disabled={carregando || salvando} onPress={carregar}><Text style={s.link}>Atualizar histórico e saldo</Text></TouchableOpacity>
            {!carregando && !erro && dados.movimentacoes.length === 0 && <Text style={s.help}>Nenhuma movimentação registrada.</Text>}
            {dados.movimentacoes.map(m => <View key={m.id} style={s.movimento}>
              <Text style={s.movimentoTitle}>{tipos[m.tipo] || m.tipo} · {m.tipo === 'AJUSTE' ? 'Saldo definido: ' : ''}{numero(m.quantidade)} {produto.unidade}</Text>
              <Text style={s.help}>{new Date(m.created_at).toLocaleString('pt-BR')} · {m.usuario_nome || 'Sistema'}</Text>
              {!!m.tecnico_nome && <Text style={s.help}>Técnico: {m.tecnico_nome}</Text>}
              {!!m.os_id && <Text style={s.help}>O.S. #{m.os_id}</Text>}
              {!!m.observacao && <Text style={s.observacao}>{m.observacao}</Text>}
            </View>)}
          </>}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

const createStyles = colors => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  sheet: { maxHeight: '95%', backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  saldo: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tab: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  tabAtiva: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.background },
  tabText: { color: colors.text, fontWeight: '700' },
  content: { paddingBottom: 20, gap: 12 },
  label: { color: colors.text, fontWeight: '700' },
  help: { color: colors.muted, lineHeight: 20 },
  input: { padding: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 10, color: colors.text, backgroundColor: colors.background, textAlignVertical: 'top' },
  confirmar: { padding: 15, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center' },
  confirmarText: { color: '#fff', fontWeight: '800' },
  link: { color: colors.primary, fontWeight: '800', paddingVertical: 8 },
  movimento: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 4 },
  movimentoTitle: { color: colors.text, fontWeight: '800' },
  observacao: { color: colors.text },
  aviso: { gap: 6 }, erro: { color: colors.danger },
});
