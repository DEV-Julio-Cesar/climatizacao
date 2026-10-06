import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Text, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CameraOS({ route, navigation }) {
  const { os_id } = route.params; // Recebe o ID da O.S. criada na tela anterior
  const [permissao, solicitarPermissao] = Camera.useCameraPermissions();
  const [fotoCapturada, setFotoCapturada] = useState(null);
  const [loading, setLoading] = useState(false);
  const cameraRef = useRef(null);

  if (!permissao) return <View />;
  if (!permissao.granted) {
    return (
      <View style={styles.containerCenter}>
        <Text>Precisamos de acesso à câmera para registrar o serviço.</Text>
        <TouchableOpacity style={styles.btn} onPress={solicitarPermissao}><Text>Conceder</Text></TouchableOpacity>
      </View>
    );
  }

  const tirarFoto = async () => {
    if (cameraRef.current) {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      
      // Reduz o tamanho da imagem para evitar consumo de dados móveis do técnico
      const fotoOtimizada = await ImageManipulator.manipulateAsync(
        foto.uri,
        [{ resize: { width: 800 } }], // Reduz a largura para 800px
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      
      setFotoCapturada(fotoOtimizada);
    }
  };

  const enviarFoto = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('@ClimaSaaS:token');
      
      // FormData é o padrão obrigatório para enviar arquivos via HTTP
      const form = new FormData();
      form.append('os_id', os_id);
      form.append('tipo_foto', 'ANTES_SERVICO'); // Ou 'DEPOIS_SERVICO'
      form.append('imagem', {
        uri: fotoCapturada.uri,
        name: `os_${os_id}_antes.jpg`,
        type: 'image/jpeg'
      });

      const resposta = await fetch('https://sua-api.com.br/os/fotos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data', // Fundamental!
        },
        body: form
      });

      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro);

      Alert.alert('Sucesso', 'Foto salva com sucesso!');
      navigation.replace('Agenda'); // Volta para a tela inicial

    } catch (erro) {
      Alert.alert('Erro no Upload', erro.message);
    } finally {
      setLoading(false);
    }
  };

  // Se já tirou a foto, mostra o Preview. Se não, mostra a Câmera.
  return (
    <View style={styles.container}>
      {fotoCapturada ? (
        <View style={{ flex: 1 }}>
          <Image source={{ uri: fotoCapturada.uri }} style={{ flex: 1 }} />
          <View style={styles.botoesRow}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#dc3545' }]} onPress={() => setFotoCapturada(null)}>
              <Text style={styles.textoBtn}>Refazer</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#28a745' }]} onPress={enviarFoto} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.textoBtn}>Enviar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Camera style={{ flex: 1 }} type={CameraType.back} ref={cameraRef}>
          <View style={styles.cameraFooter}>
            <TouchableOpacity style={styles.botaoCaptura} onPress={tirarFoto} />
          </View>
        </Camera>
      )}
    </View>
  );
}

// Estilos omitidos por brevidade (basta criar botões grandes para toque fácil)
const styles = StyleSheet.create({ /* ... */ });