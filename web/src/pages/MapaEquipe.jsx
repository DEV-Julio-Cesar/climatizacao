import React, { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function MapaEquipe() {
  const [itens,setItens] = useState([]);
  useEffect(() => {
    api.get('/agenda/gestao').then((response) => setItens(response.data.filter((item) =>
      Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))));
  }, []);
  const centro = itens[0] ? [Number(itens[0].latitude),Number(itens[0].longitude)] : [-23.55,-46.63];
  return <section className="panel map-panel">
    <div className="panel-title"><div><h2>Atendimentos no mapa</h2><p>{itens.length} endereço(s) com coordenadas</p></div></div>
    <MapContainer center={centro} zoom={11} style={{height:'65vh',borderRadius:16}}>
      <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
      {itens.map((item) => <Marker key={item.id} position={[Number(item.latitude),Number(item.longitude)]}><Popup><b>O.S. #{item.id} · {item.cliente_nome}</b><br/>{item.tecnico_nome}<br/>{item.endereco}</Popup></Marker>)}
    </MapContainer>
  </section>;
}
