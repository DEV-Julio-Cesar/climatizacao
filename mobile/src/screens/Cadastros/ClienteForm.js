import FormScrollView from '../../components/FormScrollView';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';
const {enderecoGps}=require('../../services/EnderecoGps.cjs');
const comPrazo=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('A localização demorou. Vá para uma área aberta e tente novamente.')),ms);})]).finally(()=>clearTimeout(timer));};
export default function ClienteForm({ route, navigation }) {
  const cliente = route.params?.cliente;
  const [dados, setDados] = useState({ nome:cliente?.nome||'', telefone:cliente?.telefone||'', endereco:cliente?.endereco||'', numero:cliente?.numero||'', complemento:cliente?.complemento||'', bairro:cliente?.bairro||'', cep:cliente?.cep||'', cidade:cliente?.cidade||'', estado:cliente?.estado||'', latitude:cliente?.latitude ?? null, longitude:cliente?.longitude ?? null });
  const [loading,setLoading]=useState(false),[localizando,setLocalizando]=useState(''),[aviso,setAviso]=useState('');
  const ativo=useRef(true);useEffect(()=>{ativo.current=true;return()=>{ativo.current=false;};},[]);
  const ocupado=loading||!!localizando;
  const campo=(chave,valor)=>{setAviso('');setDados(d=>({...d,[chave]:valor,...(['endereco','numero','bairro','cep','cidade','estado'].includes(chave)?{latitude:null,longitude:null}:{})}));};
  const enderecoCompleto=()=>[dados.endereco,dados.numero,dados.bairro,dados.cidade,dados.estado,dados.cep,'Brasil'].filter(Boolean).join(', ');
  const autorizarLocalizacao=async()=>{const p=await Location.requestForegroundPermissionsAsync();if(p.status!=='granted')throw new Error('Acesso à localização não autorizado. Você pode preencher o endereço manualmente ou autorizar nas configurações do celular.');if(!await Location.hasServicesEnabledAsync())throw new Error('Ative a localização (GPS) do celular e tente novamente.');};
  const localizar=async()=>{
    if(ocupado)return;
    if(!dados.endereco||!dados.cidade)return Alert.alert('Localização','Informe pelo menos rua e cidade.');
    setLocalizando('endereco');setAviso('');
    try{await autorizarLocalizacao();const encontrados=await comPrazo(Location.geocodeAsync(enderecoCompleto()),15000);if(!encontrados[0])throw new Error('Endereço não encontrado. Confira os dados.');if(ativo.current){setDados(d=>({...d,latitude:encontrados[0].latitude,longitude:encontrados[0].longitude}));setAviso('Posição aproximada obtida a partir do endereço. Confira antes de salvar.');}}
    catch(e){if(ativo.current)Alert.alert('Localização',e.message);}finally{if(ativo.current)setLocalizando('');}
  };
  const obterGps=async()=>{
    if(ocupado)return;setLocalizando('gps');setAviso('');
    try{
      await autorizarLocalizacao();
      const position=await comPrazo(Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}),20000);
      let address;try{address=(await comPrazo(Location.reverseGeocodeAsync({latitude:position.coords.latitude,longitude:position.coords.longitude}),12000))[0];}catch{address=null;}
      const preenchimento=enderecoGps(address||{},position.coords);
      if(ativo.current){
        setDados(d=>({...d,...preenchimento}));
        const incompleto=!address||!preenchimento.endereco;
        setAviso((incompleto?'GPS capturado, mas o endereço não foi encontrado. Complete os campos manualmente.':'Endereço preenchido pelo GPS. Confira principalmente o número e o complemento antes de salvar.')+(position.coords.accuracy>100?' A precisão está baixa; a posição pode estar distante do imóvel.':''));
      }
    }catch(e){if(ativo.current)Alert.alert('Localização atual',e.message);}finally{if(ativo.current)setLocalizando('');}
  };
  const usarGps=()=>{
    if(dados.endereco||dados.numero||dados.bairro||dados.cep||dados.cidade||dados.estado)Alert.alert('Usar localização atual?','Faça isso quando estiver no endereço do cliente. Os campos encontrados pelo GPS substituirão os correspondentes já preenchidos. Nome, telefone e complemento serão mantidos.',[{text:'Cancelar',style:'cancel'},{text:'Usar GPS',onPress:obterGps}]);
    else obterGps();
  };
  const salvar=async()=>{
    if(ocupado)return;if(dados.nome.trim().length<2)return Alert.alert('Cliente','Informe o nome.');setLoading(true);
    try{await api.chamadaAutenticada(cliente?`/clientes/${cliente.id}`:'/clientes',cliente?'PATCH':'POST',dados);navigation.goBack();}catch(e){if(ativo.current)Alert.alert('Cliente',e.message);}finally{if(ativo.current)setLoading(false);}
  };
  return <FormScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{cliente?'Editar cliente':'Novo cliente'}</Text><Text style={styles.subtitle}>Estando no imóvel do cliente, use o GPS para sugerir o endereço. Revise os dados antes de salvar.</Text>
    <TouchableOpacity accessibilityLabel="Usar minha localização atual para preencher o endereço" style={styles.gps} onPress={usarGps} disabled={ocupado}>{localizando==='gps'?<ActivityIndicator color="#fff"/>:<><Ionicons name="locate-outline" size={22} color="#fff"/><Text style={styles.gpsText}>Usar minha localização atual</Text></>}</TouchableOpacity>
    <Text style={styles.hint}>Usa o GPS e o serviço de endereços do celular. Não é necessário abrir o Google Maps.</Text>
    <Input label="Nome *" value={dados.nome} onChangeText={v=>campo('nome',v)} editable={!ocupado}/><Input label="Telefone / WhatsApp" value={dados.telefone} onChangeText={v=>campo('telefone',v)} keyboardType="phone-pad" editable={!ocupado}/>
    <Input label="Rua / avenida" value={dados.endereco} onChangeText={v=>campo('endereco',v)} editable={!ocupado}/><Input label="Número" value={dados.numero} onChangeText={v=>campo('numero',v)} editable={!ocupado}/><Input label="Complemento" value={dados.complemento} onChangeText={v=>campo('complemento',v)} editable={!ocupado}/><Input label="Bairro" value={dados.bairro} onChangeText={v=>campo('bairro',v)} editable={!ocupado}/><Input label="CEP" value={dados.cep} onChangeText={v=>campo('cep',v)} keyboardType="numeric" maxLength={9} editable={!ocupado}/><Input label="Cidade" value={dados.cidade} onChangeText={v=>campo('cidade',v)} editable={!ocupado}/><Input label="Estado (UF)" value={dados.estado} onChangeText={v=>campo('estado',v.toUpperCase().slice(0,2))} editable={!ocupado}/>
    <TouchableOpacity style={styles.locate} onPress={localizar} disabled={ocupado}>{localizando==='endereco'?<ActivityIndicator color={colors.primary}/>:<><Ionicons name="location-outline" size={20} color={colors.primary}/><Text style={styles.locateText}>Localizar endereço digitado no mapa</Text></>}</TouchableOpacity>
    {!!aviso&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{aviso}</Text>}
    {dados.latitude!==null&&dados.longitude!==null&&<View style={styles.confirmed}><Ionicons name="checkmark-circle" size={20} color={colors.success}/><View><Text style={styles.confirmedTitle}>Posição registrada</Text><Text style={styles.coords}>{Number(dados.latitude).toFixed(6)}, {Number(dados.longitude).toFixed(6)}</Text></View></View>}
    <TouchableOpacity style={styles.button} onPress={salvar} disabled={ocupado}>{loading?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Salvar cliente</Text>}</TouchableOpacity>
  </FormScrollView>;
}
function Input({label,...props}){return <><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} placeholderTextColor="#94A3AD" {...props}/></>;}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:colors.background},content:{padding:18,paddingBottom:35},title:{fontSize:25,fontWeight:'900',color:colors.text},subtitle:{color:colors.muted,marginTop:4,marginBottom:16,lineHeight:20},gps:{backgroundColor:colors.primary,minHeight:52,borderRadius:13,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',padding:12},gpsText:{color:'#fff',fontWeight:'800'},hint:{color:colors.muted,fontSize:12,marginTop:8,marginBottom:18},notice:{color:colors.text,fontSize:13,lineHeight:20,marginTop:12},label:{color:colors.text,fontWeight:'800',fontSize:12,marginBottom:6},input:{backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,borderRadius:13,padding:14,marginBottom:13,color:colors.text,...shadow},locate:{minHeight:50,borderWidth:1,borderColor:colors.primary,borderRadius:13,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',padding:10},locateText:{color:colors.primary,fontWeight:'800'},confirmed:{backgroundColor:'#E8F7F1',borderRadius:13,padding:12,marginTop:10,flexDirection:'row',alignItems:'center',gap:9},confirmedTitle:{color:colors.success,fontWeight:'800'},coords:{color:colors.muted,fontSize:11,marginTop:2},button:{backgroundColor:colors.success,minHeight:56,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:16},buttonText:{color:'#fff',fontWeight:'900'}});
