import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

const vazio = { nome: '', email: '', senha: '', confirmar: '' };

export default function Tecnicos() {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState(vazio);
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(async () => {
    try { setDados(await api.chamadaAutenticada('/configuracoes/tecnicos')); }
    catch (error) { Alert.alert('Equipe técnica', error.message); }
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const salvar = async () => {
    if (form.nome.trim().length < 3) return Alert.alert('Revise os dados', 'Informe o nome completo.');
    if (!form.email.includes('@')) return Alert.alert('Revise os dados', 'Informe um e-mail válido.');
    if (form.senha.length < 8) return Alert.alert('Revise os dados', 'A senha deve ter pelo menos 8 caracteres.');
    if (form.senha !== form.confirmar) return Alert.alert('Revise os dados', 'As senhas não conferem.');
    setSalvando(true);
    try {
      await api.chamadaAutenticada('/configuracoes/tecnicos', 'POST', { nome: form.nome.trim(), email: form.email.trim(), senha: form.senha });
      setModal(false); setForm(vazio); await carregar();
      Alert.alert('Técnico cadastrado', 'O profissional já pode entrar no aplicativo com o e-mail e a senha informados.');
    } catch (error) { Alert.alert('Não foi possível cadastrar', error.message); }
    finally { setSalvando(false); }
  };

  if (!dados) return <View style={s.center}><ActivityIndicator size="large" color={colors.primary}/></View>;
  return <View style={s.page}>
    <FlatList data={dados} keyExtractor={(item) => String(item.id)} contentContainerStyle={s.list} onRefresh={carregar} refreshing={false}
      ListHeaderComponent={<><Text style={s.intro}>Cadastre os profissionais que receberão serviços e acessarão o aplicativo.</Text><TouchableOpacity style={s.add} onPress={() => { setForm(vazio); setModal(true); }}><Ionicons name="person-add-outline" size={21} color="#fff"/><Text style={s.addText}>Cadastrar técnico</Text></TouchableOpacity></>}
      ListEmptyComponent={<Text style={s.empty}>Nenhum técnico cadastrado.</Text>}
      renderItem={({ item }) => <View style={s.card}><View style={s.avatar}><Text style={s.avatarText}>{item.nome.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.name}>{item.nome}</Text><Text style={s.email}>{item.email}</Text></View><View style={[s.status, !item.ativo && s.inactive]}><Text style={s.statusText}>{item.ativo ? 'ATIVO' : 'INATIVO'}</Text></View></View>}/>
    <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}><KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.sheet}><View style={s.sheetHead}><View><Text style={s.eyebrow}>NOVO ACESSO</Text><Text style={s.title}>Cadastrar técnico</Text></View><TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={27} color={colors.text}/></TouchableOpacity></View><Input label="Nome completo" value={form.nome} onChangeText={(nome) => setForm({ ...form, nome })}/><Input label="E-mail de acesso" value={form.email} onChangeText={(email) => setForm({ ...form, email })} keyboardType="email-address" autoCapitalize="none"/><Input label="Senha inicial" value={form.senha} onChangeText={(senha) => setForm({ ...form, senha })} secureTextEntry/><Input label="Confirmar senha" value={form.confirmar} onChangeText={(confirmar) => setForm({ ...form, confirmar })} secureTextEntry/><Text style={s.hint}>Use pelo menos 8 caracteres. O técnico utilizará essas credenciais no primeiro acesso.</Text><TouchableOpacity style={s.save} onPress={salvar} disabled={salvando}>{salvando ? <ActivityIndicator color="#fff"/> : <Text style={s.saveText}>Cadastrar técnico</Text>}</TouchableOpacity></View></KeyboardAvoidingView></Modal>
  </View>;
}

function Input({ label, ...props }) { return <View><Text style={s.label}>{label} *</Text><TextInput {...props} style={s.input} placeholderTextColor="#94A5AE"/></View>; }
const s = StyleSheet.create({ page:{flex:1,backgroundColor:colors.background},list:{padding:16,paddingBottom:40},center:{flex:1,alignItems:'center',justifyContent:'center'},intro:{color:colors.muted,lineHeight:20,marginBottom:12},add:{backgroundColor:colors.primary,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,padding:14,borderRadius:14,marginBottom:16},addText:{color:'#fff',fontWeight:'900'},card:{backgroundColor:'#fff',padding:14,borderRadius:16,marginBottom:10,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:colors.border,...shadow},avatar:{width:45,height:45,borderRadius:14,backgroundColor:'#E7F5F8',alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primary,fontSize:19,fontWeight:'900'},name:{color:colors.text,fontWeight:'900'},email:{color:colors.muted,fontSize:12,marginTop:3},status:{backgroundColor:'#E5F7F0',borderRadius:20,paddingVertical:5,paddingHorizontal:8},inactive:{backgroundColor:'#F2F3F4'},statusText:{fontSize:9,fontWeight:'900',color:colors.success},empty:{textAlign:'center',color:colors.muted,padding:40},overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(5,20,30,.55)'},sheet:{backgroundColor:'#fff',padding:20,paddingBottom:30,borderTopLeftRadius:24,borderTopRightRadius:24,gap:11},sheetHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:4},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.primary},title:{fontSize:21,fontWeight:'900',color:colors.text,marginTop:2},label:{fontSize:11,fontWeight:'800',color:colors.muted,marginBottom:5},input:{borderWidth:1,borderColor:colors.border,borderRadius:11,padding:12,color:colors.text,backgroundColor:'#fff'},hint:{color:colors.muted,fontSize:11,lineHeight:16},save:{backgroundColor:colors.success,padding:15,borderRadius:13,alignItems:'center',marginTop:4},saveText:{color:'#fff',fontWeight:'900'} });
