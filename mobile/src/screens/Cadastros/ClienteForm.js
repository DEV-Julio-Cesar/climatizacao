import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

export default function ClienteForm({ route, navigation }) {
  const cliente = route.params?.cliente;
  const [dados, setDados] = useState({ nome:cliente?.nome||'', telefone:cliente?.telefone||'', endereco:cliente?.endereco||'', cep:cliente?.cep||'', cidade:cliente?.cidade||'', estado:cliente?.estado||'', latitude:cliente?.latitude ?? null, longitude:cliente?.longitude ?? null });
  const [loading, setLoading] = useState(false); const [localizando, setLocalizando] = useState(false);
  const campo = (chave, valor) => setDados({ ...dados, [chave]: valor, ...(['endereco','cep','cidade','estado'].includes(chave) ? { latitude:null, longitude:null } : {}) });
  const enderecoCompleto = () => [dados.endereco, dados.cidade, dados.estado, dados.cep, 'Brasil'].filter(Boolean).join(', ');

  const localizar = async () => {
    if (!dados.endereco || !dados.cidade) return Alert.alert('Localização', 'Informe pelo menos endereço e cidade.');
    setLocalizando(true);
    try {
      const encontrados = await Location.geocodeAsync(enderecoCompleto());
      if (!encontrados[0]) return Alert.alert('Localização', 'Endereço não encontrado. Confira os dados informados.');
      setDados({ ...dados, latitude: encontrados[0].latitude, longitude: encontrados[0].longitude });
    } catch (e) { Alert.alert('Localização', e.message); } finally { setLocalizando(false); }
  };
  const salvar = async () => {
    if (dados.nome.trim().length < 2) return Alert.alert('Cliente','Informe o nome.');
    setLoading(true);
    try {
      let payload = { ...dados };
      if (!payload.latitude && payload.endereco && payload.cidade) {
        const encontrados = await Location.geocodeAsync(enderecoCompleto()).catch(() => []);
        if (encontrados[0]) payload = { ...payload, latitude: encontrados[0].latitude, longitude: encontrados[0].longitude };
      }
      await api.chamadaAutenticada(cliente ? `/clientes/${cliente.id}` : '/clientes', cliente ? 'PATCH' : 'POST', payload);
      navigation.goBack();
    } catch (e) { Alert.alert('Cliente',e.message); } finally { setLoading(false); }
  };
  return <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{cliente ? 'Editar cliente' : 'Novo cliente'}</Text><Text style={styles.subtitle}>Cadastre um endereço completo para posicionar corretamente o atendimento no mapa.</Text>
    <Input label="Nome *" value={dados.nome} onChangeText={(v)=>campo('nome',v)} /><Input label="Telefone / WhatsApp" value={dados.telefone} onChangeText={(v)=>campo('telefone',v)} keyboardType="phone-pad" /><Input label="Endereço (rua e número)" value={dados.endereco} onChangeText={(v)=>campo('endereco',v)} /><Input label="CEP" value={dados.cep} onChangeText={(v)=>campo('cep',v)} keyboardType="numeric" /><Input label="Cidade" value={dados.cidade} onChangeText={(v)=>campo('cidade',v)} /><Input label="Estado (UF)" value={dados.estado} onChangeText={(v)=>campo('estado',v.toUpperCase().slice(0,2))} />
    <TouchableOpacity style={styles.locate} onPress={localizar} disabled={localizando}>{localizando ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="location-outline" size={20} color={colors.primary} /><Text style={styles.locateText}>Localizar endereço no mapa</Text></>}</TouchableOpacity>
    {dados.latitude !== null && <View style={styles.confirmed}><Ionicons name="checkmark-circle" size={20} color={colors.success} /><View><Text style={styles.confirmedTitle}>Endereço localizado</Text><Text style={styles.coords}>{Number(dados.latitude).toFixed(6)}, {Number(dados.longitude).toFixed(6)}</Text></View></View>}
    <TouchableOpacity style={styles.button} onPress={salvar} disabled={loading}>{loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Salvar cliente</Text>}</TouchableOpacity>
  </ScrollView>;
}
function Input({label,...props}) { return <><Text style={styles.label}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#94A3AD" {...props}/></>; }
const styles=StyleSheet.create({container:{flex:1,backgroundColor:colors.background},content:{padding:18,paddingBottom:35},title:{fontSize:25,fontWeight:'900',color:colors.text},subtitle:{color:colors.muted,marginTop:4,marginBottom:20,lineHeight:20},label:{color:colors.text,fontWeight:'800',fontSize:12,marginBottom:6},input:{backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,borderRadius:13,padding:14,marginBottom:13,color:colors.text,...shadow},locate:{minHeight:50,borderWidth:1,borderColor:colors.primary,borderRadius:13,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},locateText:{color:colors.primary,fontWeight:'800'},confirmed:{backgroundColor:'#E8F7F1',borderRadius:13,padding:12,marginTop:10,flexDirection:'row',alignItems:'center',gap:9},confirmedTitle:{color:colors.success,fontWeight:'800'},coords:{color:colors.muted,fontSize:11,marginTop:2},button:{backgroundColor:colors.success,minHeight:56,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:16},buttonText:{color:'#fff',fontWeight:'900'}});
