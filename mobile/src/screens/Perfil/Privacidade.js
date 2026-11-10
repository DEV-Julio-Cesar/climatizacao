import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { BASE_URL } from '../../services/api';
import { criarSolicitacao, detalhesSolicitacao, listarSolicitacoes, responderSolicitacao, statusPrivacidade, tiposPrivacidade } from '../../services/privacidade';
import { useScreenStyles } from '../../styles/useScreenStyles';

const dataHora = valor => new Date(valor).toLocaleString('pt-BR');
function Botao({ children, onPress, disabled, secundario, styles }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.botao, secundario && styles.secundario, disabled && styles.desabilitado]}><Text style={[styles.botaoTexto, secundario && styles.secundarioTexto]}>{children}</Text></TouchableOpacity>;
}
function Chips({ opcoes, valor, onChange, styles, disabled }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{Object.entries(opcoes).map(([chave, texto]) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: valor === chave }} key={chave} disabled={disabled} onPress={() => onChange(chave)} style={[styles.chip, valor === chave && styles.chipAtivo]}><Text style={[styles.chipTexto, valor === chave && styles.botaoTexto]}>{texto}</Text></TouchableOpacity>)}</ScrollView>;
}

export default function Privacidade({ navigation }) {
  const { styles, colors } = useScreenStyles(createStyles);
  const [dados, setDados] = useState({ solicitacoes: [], pode_gerenciar: false, pode_registrar_cliente: false, tem_mais: false });
  const [filtros, setFiltros] = useState({ pagina: 1, status: '' });
  const [loading, setLoading] = useState(true), [erro, setErro] = useState(''), [aviso, setAviso] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false), [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState('ACESSO'), [descricao, setDescricao] = useState(''), [clienteId, setClienteId] = useState('');
  const leitura = useRef(0), enviando = useRef(false), pendente = useRef(null);
  const carregar = useCallback(async () => {
    const versao = ++leitura.current; setLoading(true); setErro('');
    setDados(anterior => ({ ...anterior, solicitacoes: [], tem_mais: false }));
    try {
      const resultado = await listarSolicitacoes(filtros);
      if (versao === leitura.current) setDados(resultado);
    } catch (error) { if (versao === leitura.current) setErro(error.message); }
    finally { if (versao === leitura.current) setLoading(false); }
  }, [filtros]);
  useFocusEffect(useCallback(() => { void carregar(); return () => { leitura.current++; }; }, [carregar]));
  const registrar = async () => {
    if (enviando.current) return;
    if (descricao.trim().length < 10) return Alert.alert('Descrição', 'Descreva o pedido com pelo menos 10 caracteres.');
    if (clienteId && (!/^\d+$/.test(clienteId) || Number(clienteId) <= 0)) return Alert.alert('Cliente', 'Informe um número de cliente válido.');
    enviando.current = true; setSalvando(true); setErro(''); setAviso('');
    try {
      const payload = { tipo, descricao: descricao.trim(), ...(clienteId ? { cliente_id: Number(clienteId) } : {}) };
      const assinatura = JSON.stringify(payload);
      if (pendente.current?.assinatura !== assinatura) pendente.current = { assinatura, chave: Crypto.randomUUID() };
      const resultado = await criarSolicitacao(payload, pendente.current.chave);
      pendente.current = null; setDescricao(''); setClienteId(''); setMostrarForm(false);
      setAviso(`Protocolo ${resultado.protocolo}. Guarde este número para acompanhamento.`);
      if (filtros.pagina === 1) await carregar(); else setFiltros({ ...filtros, pagina: 1 });
    } catch (error) { setErro(`${error.message} Se houve falha de conexão, consulte os protocolos antes de iniciar outro pedido.`); }
    finally { enviando.current = false; setSalvando(false); }
  };
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FlatList data={loading ? [] : dados.solicitacoes} keyExtractor={item => item.protocolo} contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled"
      refreshing={loading} onRefresh={carregar}
      ListHeaderComponent={<>
        <Text style={styles.titulo}>Seus dados e solicitações</Text><Text style={styles.texto}>Registre pedidos de acesso, correção ou avaliação de exclusão. O registro exige internet; não entra na fila de atendimentos offline.</Text>
        <Botao styles={styles} secundario onPress={() => Linking.openURL(`${BASE_URL}/privacidade`).catch(() => Alert.alert('Privacidade', 'Não foi possível abrir o aviso.'))}>Ler aviso de privacidade</Botao>
        {!!erro && <Text accessibilityRole="alert" style={styles.erro}>{erro}</Text>}{!!aviso && <Text selectable style={styles.aviso}>{aviso}</Text>}
        <Botao styles={styles} disabled={salvando} onPress={() => setMostrarForm(!mostrarForm)}>{mostrarForm ? 'Fechar formulário' : 'Nova solicitação'}</Botao>
        {mostrarForm && <View style={styles.card}>
          <Text style={styles.rotulo}>Tipo de pedido</Text><Chips opcoes={tiposPrivacidade} valor={tipo} onChange={setTipo} styles={styles} disabled={salvando}/>
          {dados.pode_registrar_cliente && <><Text style={styles.rotulo}>Número do cliente (opcional)</Text><TextInput accessibilityLabel="Número do cliente" value={clienteId} onChangeText={setClienteId} keyboardType="number-pad" maxLength={10} style={styles.input} placeholder="Deixe vazio para pedido sobre sua conta" placeholderTextColor={colors.muted} editable={!salvando}/><Text style={styles.ajuda}>Para pedido recebido de cliente, verifique a identidade por canal adequado antes de registrar. Não anexe documentos.</Text></>}
          <Text style={styles.rotulo}>Descrição</Text><TextInput accessibilityLabel="Descrição da solicitação" value={descricao} onChangeText={setDescricao} multiline maxLength={2000} style={[styles.input, styles.area]} placeholder="Explique o pedido sem senhas ou documentos" placeholderTextColor={colors.muted} editable={!salvando}/>
          <Text style={styles.ajuda}>Uma solicitação de exclusão será analisada pela empresa. Registrar o pedido não apaga dados automaticamente.</Text>
          <Botao styles={styles} disabled={salvando || loading} onPress={registrar}>{salvando ? 'Registrando...' : 'Registrar e gerar protocolo'}</Botao>
        </View>}
        <Text style={styles.subtitulo}>{dados.pode_gerenciar ? 'Solicitações da empresa' : 'Minhas solicitações'}</Text>
        <Chips opcoes={{ '': 'Todas', ...statusPrivacidade }} valor={filtros.status} onChange={status => setFiltros({ pagina: 1, status })} styles={styles} disabled={salvando}/>
      </>}
      ListEmptyComponent={loading ? <ActivityIndicator style={styles.espaco} color={colors.primary}/> : <View style={styles.card}><Text style={styles.texto}>{erro ? 'Não foi possível carregar os protocolos.' : 'Nenhuma solicitação para esta situação.'}</Text><Botao styles={styles} secundario onPress={carregar}>Atualizar</Botao></View>}
      renderItem={({ item }) => <TouchableOpacity accessibilityRole="button" style={styles.card} onPress={() => navigation.navigate('DetalhePrivacidade', { protocolo: item.protocolo })}>
        <Text style={styles.rotulo}>{tiposPrivacidade[item.tipo]}</Text><Text style={styles.situacao}>{statusPrivacidade[item.status]}</Text>
        <Text selectable style={styles.protocolo}>{item.protocolo}</Text><Text style={styles.ajuda}>{dataHora(item.created_at)}</Text><Text numberOfLines={2} style={styles.texto}>{item.descricao}</Text><Text style={styles.link}>Ver resposta e histórico</Text>
      </TouchableOpacity>}
      ListFooterComponent={<View style={styles.paginacao}><Botao styles={styles} secundario disabled={loading || filtros.pagina === 1} onPress={() => setFiltros({ ...filtros, pagina: filtros.pagina - 1 })}>Anterior</Botao><Text style={styles.texto}>Página {filtros.pagina}</Text><Botao styles={styles} secundario disabled={loading || !dados.tem_mais} onPress={() => setFiltros({ ...filtros, pagina: filtros.pagina + 1 })}>Próxima</Botao></View>}/>
  </KeyboardAvoidingView>;
}

export function DetalhePrivacidade({ route }) {
  const { styles, colors } = useScreenStyles(createStyles), { protocolo } = route.params;
  const [dados, setDados] = useState(null), [erro, setErro] = useState(''), [resposta, setResposta] = useState('');
  const [loading, setLoading] = useState(true), [salvando, setSalvando] = useState(false);
  const leitura = useRef(0), envio = useRef(false);
  const carregar = useCallback(async (cursor = 0) => {
    const versao = ++leitura.current; setLoading(true); setErro('');
    try {
      const resultado = await detalhesSolicitacao(protocolo, cursor);
      if (versao === leitura.current) setDados(anterior => ({ ...resultado, historico: cursor && anterior ? [...anterior.historico, ...resultado.historico.filter(i => !anterior.historico.some(a => a.id === i.id))] : resultado.historico }));
    } catch (error) { if (versao === leitura.current) { if (error.status === 403 || error.status === 404) setDados(null); setErro(error.message); } }
    finally { if (versao === leitura.current) setLoading(false); }
  }, [protocolo]);
  useFocusEffect(useCallback(() => { void carregar(); return () => { leitura.current++; }; }, [carregar]));
  const responder = async status => {
    if (envio.current) return;
    if (resposta.trim().length < 10) return Alert.alert('Resposta', 'Informe pelo menos 10 caracteres.');
    envio.current = true; setSalvando(true); setErro('');
    try { await responderSolicitacao(protocolo, status, resposta.trim()); setResposta(''); await carregar(); }
    catch (error) { setErro(error.message); }
    finally { envio.current = false; setSalvando(false); }
  };
  const pedido = dados?.solicitacao;
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FlatList data={dados?.historico || []} keyExtractor={i => String(i.id)} contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled" refreshing={loading} onRefresh={() => carregar()}
      ListHeaderComponent={<>
        <Text style={styles.titulo}>Acompanhar solicitação</Text><Text selectable style={styles.protocolo}>{protocolo}</Text>
        {!!erro && <Text accessibilityRole="alert" style={styles.erro}>{erro}</Text>}
        <Botao styles={styles} secundario disabled={loading} onPress={() => carregar()}>Atualizar</Botao>
        <Botao styles={styles} secundario onPress={() => Share.share({ message: `Protocolo de privacidade: ${protocolo}. Acompanhe com a empresa responsável.` }).catch(() => Alert.alert('Protocolo', 'Não foi possível compartilhar.'))}>Compartilhar número do protocolo</Botao>
        {pedido && <View style={styles.card}><Text style={styles.subtitulo}>{tiposPrivacidade[pedido.tipo]}</Text><Text style={styles.situacao}>{statusPrivacidade[pedido.status]}</Text><Text style={styles.texto}>{pedido.descricao}</Text><Text style={styles.ajuda}>Registrado em {dataHora(pedido.created_at)}{pedido.cliente_id ? ` · Cliente #${pedido.cliente_id}` : ''}</Text>{!!pedido.resposta && <><Text style={styles.rotulo}>Resposta mais recente</Text><Text style={styles.texto}>{pedido.resposta}</Text></>}</View>}
        {pedido && dados.pode_gerenciar && pedido.status !== 'CONCLUIDA' && <View style={styles.card}>
          <Text style={styles.rotulo}>Registrar análise ou resposta</Text><TextInput accessibilityLabel="Resposta da solicitação" multiline maxLength={4000} value={resposta} onChangeText={setResposta} editable={!salvando} style={[styles.input, styles.area]} placeholder="Informe o andamento sem dados de terceiros" placeholderTextColor={colors.muted}/><Text style={styles.ajuda}>Concluir o protocolo não executa exclusão de dados. Verifique as providências antes de concluir.</Text>
          <Botao styles={styles} disabled={salvando || loading} onPress={() => responder('EM_ANALISE')}>{pedido.status === 'RECEBIDA' ? 'Iniciar análise' : 'Registrar andamento'}</Botao>
          {pedido.status === 'EM_ANALISE' && <Botao styles={styles} secundario disabled={salvando || loading} onPress={() => Alert.alert('Concluir solicitação', 'Confirma que a análise foi realizada e a resposta está pronta?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Concluir', onPress: () => responder('CONCLUIDA') }])}>Concluir com resposta</Botao>}
        </View>}
        <Text style={styles.subtitulo}>Histórico de andamentos</Text>
      </>}
      renderItem={({ item }) => <View style={styles.card}><Text style={styles.rotulo}>{statusPrivacidade[item.status]}</Text><Text style={styles.ajuda}>{dataHora(item.created_at)}</Text>{!!item.resposta && <Text style={styles.texto}>{item.resposta}</Text>}</View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary}/> : <Text style={styles.texto}>Nenhum andamento disponível.</Text>}
      ListFooterComponent={dados?.paginacao.tem_mais ? <Botao styles={styles} disabled={loading} onPress={() => carregar(dados.paginacao.proximo_cursor)}>Carregar mais andamentos</Botao> : null}/>
  </KeyboardAvoidingView>;
}

const createStyles = (c, shadow) => StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background }, conteudo: { padding: 16, paddingBottom: 36, gap: 12 },
  titulo: { color: c.text, fontSize: 23, fontWeight: '800', marginBottom: 8 }, subtitulo: { color: c.text, fontSize: 18, fontWeight: '800', marginVertical: 12 },
  texto: { color: c.text, lineHeight: 22, marginVertical: 5 }, ajuda: { color: c.muted, fontSize: 12, lineHeight: 18, marginVertical: 6 },
  rotulo: { color: c.text, fontWeight: '700', marginTop: 8 }, card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, ...shadow },
  input: { borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, color: c.text, borderRadius: 10, padding: 12, marginTop: 8 }, area: { minHeight: 110, textAlignVertical: 'top' },
  botao: { minHeight: 48, backgroundColor: c.primaryDark, borderRadius: 12, padding: 12, justifyContent: 'center', alignItems: 'center', marginVertical: 6 }, botaoTexto: { color: '#fff', fontWeight: '800' },
  secundario: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border }, secundarioTexto: { color: c.primary }, desabilitado: { opacity: 0.5 },
  chips: { gap: 8, paddingVertical: 10 }, chip: { padding: 10, borderRadius: 12, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border }, chipAtivo: { backgroundColor: c.primaryDark }, chipTexto: { color: c.text, fontWeight: '700' },
  erro: { color: c.danger, marginVertical: 10, lineHeight: 21 }, aviso: { color: c.success, marginVertical: 10, lineHeight: 22 }, protocolo: { color: c.muted, fontSize: 12, marginVertical: 7 },
  situacao: { color: c.primary, fontWeight: '700', marginVertical: 6 }, link: { color: c.primary, fontWeight: '700', marginTop: 10 }, paginacao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, espaco: { margin: 24 },
});
