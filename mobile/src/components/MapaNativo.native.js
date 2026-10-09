import React, { useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';

export default function MapaNativo({ destino, destinos, atual, style }) {
  const map = useRef(null); const locais = destinos?.length ? destinos : [destino].filter(Boolean);
  const pontos = [...locais, atual].filter(Boolean);
  const principal = locais[0];
  return <MapView
    ref={map}
    style={style}
    initialRegion={{ latitude: principal.latitude, longitude: principal.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
    showsUserLocation
    showsMyLocationButton
    onMapReady={() => pontos.length > 1 && map.current?.fitToCoordinates(pontos, { edgePadding:{top:70,right:45,bottom:180,left:45}, animated:true })}
  >
    {locais.map((local, index) => <Marker key={local.id || index} coordinate={local} title={local.titulo || 'Local do atendimento'} description={local.endereco} pinColor={local.cor || '#087EA4'} />)}
    {atual && <Marker coordinate={atual} title="Sua posição" pinColor="#159A72" />}
  </MapView>;
}
