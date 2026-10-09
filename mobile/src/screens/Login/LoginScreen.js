import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';
import { registrarDispositivoPush } from '../../services/notifications';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('admin@climasaas.com');
  const [senha, setSenha] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const entrar = async () => {
    if (!email.trim() || senha.length < 6) return Alert.alert('Dados incompletos', 'Informe e-mail e senha.');
    setLoading(true);
    try {
      const dados = await api.login(email.trim(), senha);
      await SecureStore.setItemAsync('climasaas_token', dados.token);
      await SecureStore.setItemAsync('climasaas_usuario', JSON.stringify(dados.usuario));
      void registrarDispositivoPush().catch(() => {});
      onLogin(dados.token, dados.usuario);
    } catch (error) { Alert.alert('Não foi possível entrar', error.message); }
    finally { setLoading(false); }
  };
  return <LinearGradient colors={[colors.navy, '#0D5268', colors.primary]} style={styles.background}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={styles.brand}>
        <View style={styles.logo}><Ionicons name="snow-outline" size={38} color={colors.surface} /></View>
        <Text style={styles.title}>ClimaSaaS</Text>
        <Text style={styles.subtitle}>Sua operação técnica, mais inteligente.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.welcome}>Bem-vindo de volta</Text>
        <Text style={styles.helper}>Entre para acessar sua agenda de atendimentos.</Text>
        <Text style={styles.label}>E-mail</Text>
        <View style={styles.inputWrap}><Ionicons name="mail-outline" size={20} color={colors.muted} /><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com" placeholderTextColor="#9AAAB3" /></View>
        <Text style={styles.label}>Senha</Text>
        <View style={styles.inputWrap}><Ionicons name="lock-closed-outline" size={20} color={colors.muted} /><TextInput style={styles.input} value={senha} onChangeText={setSenha} secureTextEntry={!showPassword} placeholder="Sua senha" /><TouchableOpacity onPress={() => setShowPassword(!showPassword)}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.muted} /></TouchableOpacity></View>
        <TouchableOpacity style={styles.button} onPress={entrar} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>Entrar</Text><Ionicons name="arrow-forward" size={20} color="#fff" /></>}
        </TouchableOpacity>
      </View>
      <Text style={styles.footer}>Gestão de serviços de climatização</Text>
    </KeyboardAvoidingView>
  </LinearGradient>;
}
const styles = StyleSheet.create({
  background: { flex: 1 }, container: { flex: 1, justifyContent: 'center', padding: 22 },
  brand: { alignItems: 'center', marginBottom: 30 }, logo: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' },
  title: { fontSize: 36, fontWeight: '800', color: '#fff', marginTop: 12, letterSpacing: -.5 }, subtitle: { color: '#CDEAF2', fontSize: 15, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 22, ...shadow }, welcome: { color: colors.text, fontSize: 23, fontWeight: '800' }, helper: { color: colors.muted, lineHeight: 20, marginTop: 5, marginBottom: 20 },
  label: { color: colors.text, fontWeight: '700', marginBottom: 7, marginTop: 5 }, inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 13, marginBottom: 14 }, input: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, color: colors.text, fontSize: 15 },
  button: { backgroundColor: colors.primary, borderRadius: 14, minHeight: 54, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, buttonText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  footer: { color: '#CDEAF2', textAlign: 'center', marginTop: 24, fontSize: 12 },
});
