import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { api } from '../../services/api';

export default function AgendaMapa({ navigation }) {
  const [listaOs, setListaOs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarAgenda();
  }, []);

  const carregarAgenda = async () => {
    try {
      // Chama a rota que acabamos de criar no Node.js
      const dados = await api.chamadaAutenticada('/os/agenda', 'GET');
      setListaOs(dados);
    } catch (erro) {
      Alert.alert('Erro', erro.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0056b3" /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map}
        initialRegion={{
          latitude: -5.79448, // Exemplo: Natal, RN (Pode ser dinâmico usando expo-location)
          longitude: -35.21100,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      >
        {listaOs.map((os) => {
          // Ignora se o cliente não tiver coordenadas salvas
          if (!os.coordenadas_gps) return null; 

          // Transforma a string do banco "-5.79,-35.21" em números reais
          const [lat, lng] = os.coordenadas_gps.split(',').map(Number);

          return (
            <Marker 
              key={os.id}
              coordinate={{ latitude: lat, longitude: lng }}
              pinColor={os.status === 'EM_ANDAMENTO' ? 'green' : 'red'}
            >
              {/* O Callout é o balão que aparece quando o técnico toca no pino do mapa */}
              <Callout onPress={() => navigation.navigate('ChecklistOS', { os_id: os.id })}>
                <View style={styles.balao}>
                  <Text style={styles.tituloBalao}>O.S. #{os.id} - {os.tipo_servico}</Text>
                  <Text style={styles.textoBalao}>{os.cliente_nome}</Text>
                  <Text style={styles.linkBalao}>Toque para iniciar o serviço</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Botão flutuante para atualizar o mapa */}
      <TouchableOpacity style={styles.btnAtualizar} onPress={carregarAgenda}>
        <Text style={styles.textoBtn}>Atualizar Agenda</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { width: '100%', height: '100%' },
  balao: { width: 200, padding: 5 },
  tituloBalao: { fontWeight: 'bold', fontSize: 16, marginBottom: 5 },
  textoBalao: { fontSize: 14, color: '#333', marginBottom: 5 },
  linkBalao: { fontSize: 14, color: '#0056b3', fontWeight: 'bold' },
  
  btnAtualizar: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: '#0056b3',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    elevation: 5, // Sombra no Android
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 // Sombra no iOS
  },
  textoBtn: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});