import React,{useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ActivityIndicator,KeyboardAvoidingView,ScrollView,Platform,StyleSheet} from 'react-native';
import {api} from '../../services/api';
import {useScreenStyles} from '../../styles/useScreenStyles';
export default function EsqueciSenha({navigation,route}){
  const {styles:s,colors}=useScreenStyles(createStyles);
  const [email,setEmail]=useState(route.params?.email||''),[loading,setLoading]=useState(false),[mensagem,setMensagem]=useState(''),[erro,setErro]=useState('');
  const enviar=async()=>{setLoading(true);setErro('');setMensagem('');try{const dados=await api.solicitarRecuperacao(email.trim());setMensagem(dados.mensagem);}catch(e){setErro(e.message);}finally{setLoading(false);}};
  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.card}>
    <Text style={s.title}>Esqueci minha senha</Text><Text style={s.text}>Enviaremos um link para o e-mail cadastrado. Abra o link no navegador para definir uma nova senha. Ele expira em 15 minutos.</Text>
    <Text style={s.label}>E-mail</Text><TextInput accessibilityLabel="E-mail cadastrado" style={s.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={150} value={email} onChangeText={setEmail} placeholder="seuemail@gmail.com" placeholderTextColor={colors.muted} editable={!loading}/>
    {!!erro&&<Text accessibilityRole="alert" style={s.error}>{erro}</Text>}{!!mensagem&&<Text accessibilityLiveRegion="polite" style={s.text}>{mensagem}</Text>}
    <TouchableOpacity style={s.button} onPress={enviar} disabled={loading||!email.trim()}>{loading?<ActivityIndicator color="#fff"/>:<Text style={s.white}>Enviar link de recuperação</Text>}</TouchableOpacity>
    <TouchableOpacity style={s.back} onPress={()=>navigation.goBack()} disabled={loading}><Text style={s.link}>Voltar ao login</Text></TouchableOpacity>
  </View></ScrollView></KeyboardAvoidingView>;
}
const createStyles=colors=>StyleSheet.create({page:{flex:1,backgroundColor:colors.background},content:{flexGrow:1,justifyContent:'center',padding:20},card:{padding:20,borderRadius:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},title:{fontSize:22,fontWeight:'800',color:colors.text},text:{color:colors.muted,lineHeight:22,marginVertical:14},label:{color:colors.text,fontWeight:'700',marginBottom:8},input:{padding:14,borderWidth:1,borderColor:colors.border,color:colors.text,backgroundColor:colors.inputBg,borderRadius:12},button:{padding:16,alignItems:'center',borderRadius:12,backgroundColor:colors.primary,marginTop:16},white:{color:'#fff',fontWeight:'800'},back:{padding:16,alignItems:'center'},link:{color:colors.primary,fontWeight:'700'},error:{color:colors.danger,marginTop:12}});
