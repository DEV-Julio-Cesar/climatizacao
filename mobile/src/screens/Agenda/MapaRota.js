import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapaNativo from '../../components/MapaNativo';
import { api } from '../../services/api';
import { colors, shadow } from '../../styles/theme';

export default function MapaRota() {
  const [locais, setLocais] = useState([]); const [atual, setAtual] = useState(null); const [loading, setLoading] = useState(true); const [semLocal, setSemLocal] = useState(0);
  useEffect(() => { (async () => {
    try {
      const ordens = await api.chamadaAutenticada('/os/agenda?filtro=HOJE'); const encontrados = []; let falhas = 0;
      for (const [index, os] of ordens.entries()) {
        let latitude = Number(os.latitude); let longitude = Number(os.longitude);
        if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && os.endereco) {
          const geocode = await Location.geocodeAsync(os.endereco).catch(() => []); latitude = geocode[0]?.latitude; longitude = geocode[0]?.longitude;
        }
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) encontrados.push({ id:os.id, latitude, longitude, endereco:os.endereco, titulo:`${index + 1}. ${os.cliente_nome}`, cor:os.status === 'EM_ANDAMENTO' ? colors.warning : colors.primary }); else falhas += 1;
      }
      setLocais(encontrados); setSemLocal(falhas);
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (permissao.status === 'granted') { const posicao = await Location.getCurrentPositionAsync({ accuracy:Location.Accuracy.Balanced }); setAtual({ latitude:posicao.coords.latitude, longitude:posicao.coords.longitude }); }
    } catch (e) { Alert.alert('Rota do dia', e.message); } finally { setLoading(false); }
  })(); }, []);
  const abrirRota = () => {
    if (!locais.length) return;
    const destino = locais[locais.length - 1]; const intermediarios = locais.slice(0,-1).map((p)=>`${p.latitude},${p.longitude}`).join('|');
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${destino.latitude},${destino.longitude}` : `https://www.google.com/maps/dir/?api=1&destination=${destino.latitude},${destino.longitude}&waypoints=${encodeURIComponent(intermediarios)}&travelmode=driving`;
    Linking.openURL(url).catch(()=>Alert.alert('Rota','Não foi possível abrir o aplicativo de navegação.'));
  };
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary}/><Text style={styles.loading}>Montando a rota do dia...</Text></View>;
  if (!locais.length) return <View style={styles.center}><Ionicons name="map-outline" size={52} color={colors.muted}/><Text style={styles.empty}>Nenhuma visita de hoje possui endereço localizável.</Text></View>;
  return <View style={styles.container}><MapaNativo destinos={locais} atual={atual} style={styles.map}/><View style={styles.summary}><Text style={styles.title}>{locais.length} parada(s) no mapa</Text><Text style={styles.text}>{semLocal ? `${semLocal} atendimento(s) precisam de endereço válido.` : 'Todos os atendimentos foram localizados.'}</Text></View><TouchableOpacity style={styles.button} onPress={abrirRota}><Ionicons name="navigate" size={21} color="#fff"/><Text style={styles.buttonText}>Abrir rota do dia</Text></TouchableOpacity></View>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:colors.background},map:{flex:1},center:{flex:1,alignItems:'center',justifyContent:'center',padding:30},loading:{marginTop:10,color:colors.muted},empty:{color:colors.text,fontWeight:'700',textAlign:'center',marginTop:12},summary:{position:'absolute',left:14,right:14,bottom:88,backgroundColor:'#fff',padding:15,borderRadius:16,...shadow},title:{fontWeight:'900',color:colors.text,fontSize:16},text:{color:colors.muted,fontSize:12,marginTop:4},button:{position:'absolute',left:14,right:14,bottom:20,minHeight:56,backgroundColor:colors.primary,borderRadius:15,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,...shadow},buttonText:{color:'#fff',fontWeight:'900'}});
