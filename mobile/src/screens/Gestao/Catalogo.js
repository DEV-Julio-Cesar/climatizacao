import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { numeroEstoque } from '../../services/estoque';
import { useScreenStyles } from '../../styles/useScreenStyles';
import EstoqueProduto from '../../components/EstoqueProduto';

const vazio = { tipo: 'SERVICO', nome: '', preco: '', custo: '0', estoque: '0', estoque_minimo: '0', sku: '', descricao: '', garantia_dias: '0', unidade: 'UN' };
const numero = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dinheiro = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Catalogo() {
  const { colors, styles: s } = useScreenStyles(createStyles);
  const [cat, setCat] = useState(null);
  const [gerenciar, setGerenciar] = useState(false);
  const [visualizar, setVisualizar] = useState(false);
  const [form, setForm] = useState(vazio);
  const [modal, setModal] = useState(false);
  const [produto, setProduto] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const ocupado = useRef(false);
  const sequencia = useRef(0);

  const carregar = useCallback(async () => {
    const pedido = ++sequencia.current;
    setAtualizando(true); setErro('');
    try {
      const { usuario } = await api.chamadaAutenticada('/conta/sessao');
      const pode = permissao => usuario.permissoes?.includes('*') || usuario.permissoes?.includes(permissao);
      const editar = !!pode('ESTOQUE_GERENCIAR'), ver = !!pode('ESTOQUE_VISUALIZAR');
      if (pedido !== sequencia.current) return;
      setGerenciar(editar); setVisualizar(ver);
      if (!editar && !ver) throw new Error('Sua conta n?o tem permiss?o para consultar o estoque.');
      // O cat?logo de atendimento pode mostrar o saldo do t?cnico. A gest?o usa o central.
      const dados = await api.chamadaAutenticada(editar ? '/catalogo/gestao' : '/catalogo');
      if (pedido === sequencia.current) setCat(dados);
    } catch (e) { if (pedido === sequencia.current) setErro(e.message); }
    finally { if (pedido === sequencia.current) setAtualizando(false); }
  }, []);
  useFocusEffect(useCallback(() => { void carregar(); return () => { sequencia.current += 1; }; }, [carregar]));

  const salvar = async () => {
    if (ocupado.current) return;
    let payload;
    try {
      if (form.nome.trim().length < 2) throw new Error('Informe um nome com pelo menos dois caracteres.');
      payload = { ...form, nome: form.nome.trim(), preco: numeroEstoque(form.preco, 'Pre?o'), custo: numeroEstoque(form.custo, 'Custo'), estoque: numeroEstoque(form.estoque, 'Estoque inicial'), estoque_minimo: numeroEstoque(form.estoque_minimo, 'Estoque m?nimo'), garantia_dias: Number(form.garantia_dias || 0) };
      if (!Number.isInteger(payload.garantia_dias) || payload.garantia_dias < 0) throw new Error('Informe uma garantia v?lida em dias.');
    } catch (e) { Alert.alert('Revise os dados', e.message); return; }
    ocupado.current = true; setSalvando(true);
    try {
      await api.chamadaAutenticada('/catalogo', 'POST', payload);
      setModal(false); setForm(vazio);
      await carregar();
    } catch (e) { Alert.alert('N?o foi poss?vel salvar', e.message); }
    finally { ocupado.current = false; setSalvando(false); }
  };

  if (!cat) return <View style={s.center}>{atualizando ? <ActivityIndicator color={colors.primary} /> : <><Text style={s.error}>{erro || 'Carregue o cat?logo para continuar.'}</Text><TouchableOpacity onPress={carregar}><Text style={s.link}>Tentar novamente</Text></TouchableOpacity></>}</View>;
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const dados = [...cat.servicos, ...cat.produtos].filter(i => i.ativo !== false && (!termo || `${i.nome} ${i.sku || ''}`.toLocaleLowerCase('pt-BR').includes(termo)));

  return <View style={s.page}>
    <FlatList data={dados} keyExtractor={i => `${i.tipo}-${i.id}`} contentContainerStyle={s.list}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={colors.primary} />}
      ListHeaderComponent={<View style={s.header}>
        <Text style={s.intro}>{gerenciar ? 'Estoque central: registre entradas, sa?das e invent?rios com hist?rico.' : 'Consulte servi?os, pe?as e o saldo dispon?vel para atendimento.'}</Text>
        {!!erro && <Text style={s.error}>{erro}</Text>}
        <TextInput accessibilityLabel="Buscar no cat?logo" placeholder="Buscar por nome ou SKU" placeholderTextColor={colors.muted} value={busca} onChangeText={setBusca} style={s.input} />
        {gerenciar && <TouchableOpacity style={s.add} onPress={() => { setForm(vazio); setModal(true); }}><Ionicons name="add" size={21} color="#fff" /><Text style={s.addText}>Novo item</Text></TouchableOpacity>}
      </View>}
      ListEmptyComponent={<Text style={s.intro}>Nenhum item encontrado.</Text>}
      renderItem={({ item }) => <View style={s.card}>
        <View style={s.itemRow}><Ionicons name={item.tipo === 'PECA' ? 'cube-outline' : 'construct-outline'} size={25} color={colors.primary} />
          <View style={s.itemText}><Text style={s.name}>{item.nome}</Text>
            <Text style={s.meta}>{item.tipo === 'PECA' ? `${gerenciar ? 'Central' : 'Dispon?vel'}: ${numero(item.estoque)} ${item.unidade} ? m?nimo ${numero(item.estoque_minimo)}` : `Garantia: ${item.garantia_dias} dias`}</Text>
            {!!item.sku && <Text style={s.meta}>SKU: {item.sku}</Text>}
            <Text style={s.price}>{dinheiro(item.preco)}</Text>
            {item.tipo === 'PECA' && Number(item.estoque) <= Number(item.estoque_minimo) && <Text style={s.warning}>Estoque no m?nimo ou abaixo</Text>}
          </View>
        </View>
        {item.tipo === 'PECA' && (gerenciar || visualizar) && <TouchableOpacity accessibilityRole="button" style={s.stock} onPress={() => setProduto(item)}><Ionicons name={gerenciar ? 'swap-vertical-outline' : 'time-outline'} size={19} color={colors.primary} /><Text style={s.link}>{gerenciar ? 'Movimentar / hist?rico' : 'Hist?rico do produto'}</Text></TouchableOpacity>}
      </View>} />
    {!!produto && <EstoqueProduto key={produto.id} produto={produto} podeGerenciar={gerenciar} podeVer={visualizar} onClose={() => setProduto(null)} onAtualizado={(id, saldo) => setCat(anterior => ({ ...anterior, produtos: anterior.produtos.map(p => p.id === id ? { ...p, estoque: saldo } : p) }))} />}
    <Modal visible={modal} transparent animationType="slide" onRequestClose={() => { if (!salvando) setModal(false); }}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.form}>
            <Text style={s.sheetTitle}>Novo item do cat?logo</Text>
            <View style={s.row}>{[['SERVICO', 'Servi?o'], ['PECA', 'Pe?a']].map(([tipo, nome]) => <TouchableOpacity key={tipo} disabled={salvando} style={[s.toggle, form.tipo === tipo && s.selected]} onPress={() => setForm({ ...form, tipo })}><Text style={s.name}>{nome}</Text></TouchableOpacity>)}</View>
            {[
              ['nome', 'Nome', false], ['preco', 'Pre?o de venda', true], ['custo', 'Custo', true],
              ...(form.tipo === 'PECA' ? [['sku', 'SKU', false], ['unidade', 'Unidade (UN, M, KG...)', false], ['estoque', 'Estoque inicial', true], ['estoque_minimo', 'Estoque m?nimo', true]] : [['garantia_dias', 'Garantia em dias', true]]),
            ].map(([campo, label, numeric]) => <View key={campo}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={form[campo]} onChangeText={v => setForm({ ...form, [campo]: v })} editable={!salvando} keyboardType={numeric ? 'decimal-pad' : 'default'} style={s.input} maxLength={campo === 'nome' ? 150 : campo === 'sku' ? 80 : campo === 'unidade' ? 20 : 16} /></View>)}
            <TouchableOpacity disabled={salvando} style={s.add} onPress={salvar}>{salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.addText}>Salvar item</Text>}</TouchableOpacity>
            <TouchableOpacity disabled={salvando} onPress={() => setModal(false)}><Text style={s.cancel}>Cancelar</Text></TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const createStyles = (colors, shadow) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, list: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
  header: { gap: 12, marginBottom: 15 }, intro: { color: colors.muted, lineHeight: 21 },
  add: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 14, borderRadius: 14 },
  addText: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, ...shadow },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' }, itemText: { flex: 1 }, name: { fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4 }, price: { fontWeight: '800', color: colors.primary, marginTop: 5 },
  warning: { color: colors.warning, marginTop: 5, fontWeight: '700' },
  stock: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderColor: colors.border, marginTop: 12, paddingTop: 8 },
  link: { color: colors.primary, fontWeight: '800', paddingVertical: 8 }, error: { color: colors.danger },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  sheet: { maxHeight: '95%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20 },
  form: { gap: 14, paddingVertical: 20 }, sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', gap: 9 }, toggle: { flex: 1, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  selected: { borderColor: colors.primary, borderWidth: 2 }, label: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 12, color: colors.text, backgroundColor: colors.background },
  cancel: { textAlign: 'center', color: colors.muted, fontWeight: '700', padding: 10 },
});
