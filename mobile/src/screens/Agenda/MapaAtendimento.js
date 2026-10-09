import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapaNativo from '../../components/MapaNativo';
import { colors, shadow } from '../../styles/theme';

const distanciaKm = (a, b) => {
  if (!a || !b) return null;
  const rad = (valor) => valor * Math.PI / 180; const raio = 6371;
  const dLat = rad(b.latitude - a.latitude); const dLon = rad(b.longitude - a.longitude);
  const calculo = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return raio * 2 * Math.atan2(Math.sqrt(calculo), Math.sqrt(1 - calculo));
};

export default function MapaAtendimento({ route }) {
  const { cliente, endereco, latitude, longitude } = route.params;
  const [destino, setDestino] = useState(null); const [atual, setAtual] = useState(null); const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        let ponto = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
          ? { latitude: Number(latitude), longitude: Number(longitude), endereco }
          : null;
        if (!ponto && endereco) {
          const encontrados = await Location.geocodeAsync(endereco);
          if (encontrados[0]) ponto = { latitude: encontrados[0].latitude, longitude: encontrados[0].longitude, endereco };
        }
        if (!ponto) throw new Error('Não foi possível localizar o endereço cadastrado.');
        setDestino(ponto);
        const permissao = await Location.requestForegroundPermissionsAsync();
        if (permissao.status === 'granted') {
          const posicao = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setAtual({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude });
        }
      } catch (e) { setErro(e.message); }
    })();
  }, [endereco, latitude, longitude]);

  const navegar = () => {
    if (!destino) return;
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${destino.latitude},${destino.longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${destino.latitude},${destino.longitude}&travelmode=driving`,
    });
    Linking.openURL(url).catch(() => Alert.alert('Mapa', 'Não foi possível abrir o aplicativo de navegação.'));
  };

  if (!destino && !erro) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loading}>Localizando o atendimento...</Text></View>;
  if (erro) return <View style={styles.center}><Ionicons name="location-outline" size={48} color={colors.danger} /><Text style={styles.error}>{erro}</Text><Text style={styles.help}>Revise o endereço no cadastro do cliente.</Text></View>;
  const distancia = distanciaKm(atual, destino);
  return <View style={styles.container}>
    <MapaNativo destino={destino} atual={atual} style={styles.map} />
    <View style={styles.card}><View style={styles.icon}><Ionicons name="location" size={24} color="#fff" /></View><View style={{ flex: 1 }}><Text style={styles.client}>{cliente}</Text><Text style={styles.address}>{endereco}</Text>{distancia !== null && <Text style={styles.distance}>Aproximadamente {distancia < 1 ? `${Math.round(distancia * 1000)} m` : `${distancia.toFixed(1)} km`} em linha reta</Text>}</View></View>
    <TouchableOpacity style={styles.route} onPress={navegar}><Ionicons name="navigate" size={21} color="#fff" /><Text style={styles.routeText}>Iniciar rota até o cliente</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({ container:{flex:1,backgroundColor:colors.background},map:{flex:1},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,backgroundColor:colors.background},loading:{color:colors.muted,marginTop:12},error:{fontSize:17,fontWeight:'800',color:colors.text,textAlign:'center',marginTop:12},help:{color:colors.muted,textAlign:'center',marginTop:6},card:{position:'absolute',left:14,right:14,bottom:88,backgroundColor:'#fff',borderRadius:17,padding:15,flexDirection:'row',gap:12,...shadow},icon:{width:43,height:43,borderRadius:14,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},client:{color:colors.text,fontWeight:'900',fontSize:16},address:{color:colors.muted,fontSize:12,marginTop:3},distance:{color:colors.success,fontWeight:'700',fontSize:12,marginTop:5},route:{position:'absolute',left:14,right:14,bottom:20,minHeight:56,borderRadius:15,backgroundColor:colors.primary,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,...shadow},routeText:{color:'#fff',fontWeight:'900'} });
