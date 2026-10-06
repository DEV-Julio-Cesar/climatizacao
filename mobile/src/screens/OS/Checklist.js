import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Network from 'expo-network';
import { api } from '../../services/api';
import { salvarOsLocal } from '../../database/sqlite';

// Estes valores precisam ser exatamente iguais ao ENUM do PostgreSQL e do Zod
const TIPOS_SERVICO = ['LIMPEZA', 'INSTALACAO', 'REMOCAO', 'PREVENTIVA', 'PROBLEMA_TECNICO'];

export default function Checklist({ navigation, route }) {
  // Os IDs da empresa, cliente e técnico vêm da tela anterior via route.params
  const { empresa_id, cliente_id, aparelho_id, tecnico_id } = route?.params || {};

  const [tipoSelecionado, setTipoSelecionado] = useState('');
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);

  const enviarOrdemServico = async () => {
    // 1. Validação local rápida (poupa internet do técnico)
    if (!tipoSelecionado) {
      return Alert.alert('Atenção', 'Selecione o tipo de serviço.');
    }
    if (descricao.trim().length < 5) {
      return Alert.alert('Atenção', 'A descrição deve ter pelo menos 5 caracteres.');
    }

    setLoading(true);

    // 2. Monta o payload com os dados do formulário
    const payload = {
      empresa_id,
      cliente_id,
      aparelho_id,
      tecnico_id,
      tipo_servico:       tipoSelecionado,
      descricao_problema: descricao.trim(),
    };

    try {
      // 3. Verifica conexão antes de tentar a API
      const { isConnected, isInternetReachable } = await Network.getNetworkStateAsync();

      if (isConnected && isInternetReachable) {
        // --- COM INTERNET: envia direto para a API ---
        try {
          const resposta = await api.chamadaAutenticada('/os', 'POST', payload);

          Alert.alert('Sucesso!', 'O.S. criada. Próximo passo: Fotos.', [
            {
              text: 'Avançar',
              onPress: () => navigation.navigate('CameraOS', { os_id: resposta.os.id }),
            },
          ]);
        } catch (erroApi) {
          // Fallback: API instável → salva offline para sincronizar depois
          await salvarOsLocal({ ...payload, os_id: null });
          Alert.alert(
            'Servidor indisponível',
            'Dados salvos no celular. Serão enviados quando a conexão estabilizar.',
            [{ text: 'OK', onPress: () => navigation.navigate('Agenda') }]
          );
        }
      } else {
        // --- SEM INTERNET: salva no SQLite local ---
        await salvarOsLocal({ ...payload, os_id: null });
        Alert.alert(
          'Modo Offline 📴',
          'Sem internet. Os dados foram salvos no celular e serão enviados automaticamente depois.',
          [{ text: 'OK', onPress: () => navigation.navigate('Agenda') }]
        );
      }
    } catch (erro) {
      Alert.alert('Erro inesperado', erro.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Nova Ordem de Serviço</Text>

      <Text style={styles.label}>1. Qual o serviço principal?</Text>
      <View style={styles.chipContainer}>
        {TIPOS_SERVICO.map((tipo) => (
          <TouchableOpacity
            key={tipo}
            style={[styles.chip, tipoSelecionado === tipo && styles.chipAtivo]}
            onPress={() => setTipoSelecionado(tipo)}
            accessibilityRole="button"
            accessibilityState={{ selected: tipoSelecionado === tipo }}
          >
            <Text style={[styles.chipText, tipoSelecionado === tipo && styles.chipTextAtivo]}>
              {tipo.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>2. Descrição ou Diagnóstico:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Ar não gela, trocado capacitor de 35uF..."
        multiline
        numberOfLines={4}
        value={descricao}
        onChangeText={setDescricao}
        accessibilityLabel="Descrição do problema"
      />

      <TouchableOpacity
        style={[styles.botaoSalvar, loading && styles.botaoDesabilitado]}
        onPress={enviarOrdemServico}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Salvar e avançar"
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.botaoTexto}>Salvar e Avançar →</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, padding: 20, backgroundColor: '#F4F6F8' },
  header:           { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#111' },
  label:            { fontSize: 16, fontWeight: '600', marginBottom: 10, marginTop: 10, color: '#333' },

  // Chips de seleção rápida
  chipContainer:    { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  chip:             {
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 10,
  },
  chipAtivo:        { backgroundColor: '#0056b3' },
  chipText:         { fontSize: 14, color: '#333', fontWeight: '500' },
  chipTextAtivo:    { color: '#FFF' },

  // Campo de texto
  input:            {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 30,
  },

  // Botão principal
  botaoSalvar:      { backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center' },
  botaoDesabilitado:{ backgroundColor: '#93c9a0' },
  botaoTexto:       { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});
