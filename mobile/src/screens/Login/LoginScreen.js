import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/api';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !senha) return Alert.alert('Aviso', 'Preencha todos os campos.');
    
    setLoading(true);
    try {
      const dados = await api.login(email.trim(), senha);
      
      // Salva o Token de forma persistente no aparelho
      await AsyncStorage.setItem('@ClimaSaaS:token', dados.token);
      
      // Você também pode salvar o nome e perfil para usar na interface
      await AsyncStorage.setItem('@ClimaSaaS:usuario', JSON.stringify(dados.usuario));
      
      // Vai para a tela principal
      navigation.replace('Agenda');
      
    } catch (erro) {
      Alert.alert('Falha no Login', erro.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>ClimaSaaS</Text>
      
      <TextInput
        style={styles.input}
        placeholder="E-mail do Técnico"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
      />
      
      <TouchableOpacity 
        style={styles.botao} 
        onPress={handleLogin} 
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.textoBotao}>Entrar</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#F4F6F8' },
  titulo: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#0056b3' },
  input: { backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#DDD' },
  botao: { backgroundColor: '#0056b3', padding: 15, borderRadius: 8, alignItems: 'center' },
  textoBotao: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});