import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MapaNativo({ destino, destinos, style }) {
  const locais = destinos?.length ? destinos : [destino];
  return <View style={[style, styles.fallback]}><Text style={styles.title}>Mapa disponível no aplicativo Android/iOS</Text><Text style={styles.text}>{locais.length} local(is) preparado(s) para navegação.</Text></View>;
}

const styles = StyleSheet.create({ fallback:{alignItems:'center',justifyContent:'center',padding:25,backgroundColor:'#E8F4F7'},title:{fontWeight:'800',color:'#132A3A',textAlign:'center'},text:{color:'#6B7F8C',textAlign:'center',marginTop:8},coords:{color:'#087EA4',marginTop:5} });
