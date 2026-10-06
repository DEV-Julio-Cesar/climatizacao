import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AssinaturaOS({ route, navigation }) {
  const { os_id } = route.params; // ID da O.S. que o cliente está assinando
  const ref = useRef();
  const [loading, setLoading] = useState(false);

  // Função chamada automaticamente quando o cliente clica no botão "Confirmar" do Canvas
  const handleSignature = async (assinaturaBase64) => {
    // A assinaturaBase64 vem no formato: "data:image/png;base64,iVBORw0KGgo..."
    setLoading(true);

    try {
      // 1. Removemos o cabeçalho do base64 para ficar só o arquivo puro
      const base64Data = assinaturaBase64.replace('data:image/png;base64,', '');
      
      // 2. Criamos um caminho temporário no celular para salvar a imagem
      const filepath = `${FileSystem.cacheDirectory}assinatura_os_${os_id}.png`;
      
      // 3. Escrevemos o arquivo base64 no armazenamento temporário do aparelho
      await FileSystem.writeAsStringAsync(filepath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 4. Preparamos o FormData (Igual fizemos com a Câmera)
      const token = await AsyncStorage.getItem('@ClimaSaaS:token');
      const form = new FormData();
      form.append('os_id', os_id);
      form.append('tipo_foto', 'ASSINATURA_CLIENTE'); // Salvando com esse tipo específico
      form.append('imagem', {
        uri: filepath,
        name: `assinatura_os_${os_id}.png`,
        type: 'image/png',
      });

      // 5. Enviamos para a MESMA rota de upload que já criamos no Node.js
      const resposta = await fetch('https://sua-api.com.br/os/fotos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: form,
      });

      if (!resposta.ok) throw new Error('Falha ao enviar a assinatura para o servidor.');

      Alert.alert('Sucesso', 'Ordem de Serviço finalizada e assinada!');

      // 5. Enviamos a assinatura...
const respostaUpload = await fetch('https://sua-api.com.br/os/fotos', { /* ... */ });

if (!respostaUpload.ok) throw new Error('Falha no upload');

// 6. AGORA CHAMAMOS A ROTA PARA FINALIZAR A O.S.
const respostaStatus = await fetch(`https://sua-api.com.br/os/${os_id}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ novo_status: 'FINALIZADA' }),
});

if (!respostaStatus.ok) throw new Error('Falha ao finalizar a O.S.');

Alert.alert('Sucesso', 'Ordem de Serviço finalizada e assinada!');
navigation.replace('Agenda');
      
      // Aqui poderíamos chamar a rota para mudar o Status da O.S. para "FINALIZADA"
      navigation.replace('Agenda');

    } catch (erro) {
      Alert.alert('Erro', erro.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    ref.current.clearSignature();
  };

  const handleConfirm = () => {
    ref.current.readSignature();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Assinatura do Cliente</Text>
      <Text style={styles.subtitulo}>Eu aprovo a execução dos serviços descritos nesta O.S.</Text>

      <View style={styles.canvasContainer}>
        {/* O componente de Canvas onde o cliente desenha com o dedo */}
        <SignatureScreen
          ref={ref}
          onOK={handleSignature}
          webStyle={styleHtml} // Força o fundo a ser transparente ou branco
        />
      </View>

      <View style={styles.botoesContainer}>
        <TouchableOpacity style={styles.botaoLimpar} onPress={handleClear} disabled={loading}>
          <Text style={styles.textoBotao}>Refazer</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.botaoConfirmar} onPress={handleConfirm} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={[styles.textoBotao, { color: '#FFF' }]}>Finalizar O.S.</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Estilo injetado na WebView do Canvas para tirar as bordas feias e focar só no espaço de desenho
const styleHtml = `
  .m-signature-pad { box-shadow: none; border: none; } 
  .m-signature-pad--body { border: 1px solid #ccc; }
  .m-signature-pad--footer { display: none; margin: 0px; }
`;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F4F6F8' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#333', textAlign: 'center', marginTop: 20 },
  subtitulo: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  canvasContainer: { height: 300, backgroundColor: '#FFF', borderRadius: 8, overflow: 'hidden' },
  botoesContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  botaoLimpar: { flex: 1, padding: 15, alignItems: 'center', marginRight: 10, backgroundColor: '#DDD', borderRadius: 8 },
  botaoConfirmar: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: '#28a745', borderRadius: 8 },
  textoBotao: { fontSize: 16, fontWeight: 'bold', color: '#333' }
});