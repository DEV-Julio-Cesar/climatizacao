import React, { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';

// Corrige ícones padrão do Leaflet quando bundled com Vite/Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Centro padrão: São Paulo
const CENTRO_PADRAO = [-23.55, -46.63];

export default function MapaEquipe() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancelado = false;

    const carregar = async () => {
      setLoading(true);
      setErro('');
      try {
        const { data } = await api.get('/agenda/gestao');
        if (cancelado) return;
        // Filtra apenas itens que têm coordenadas válidas
        setItens(
          data.filter(
            (item) =>
              Number.isFinite(Number(item.latitude)) &&
              Number.isFinite(Number(item.longitude)),
          ),
        );
      } catch (e) {
        if (cancelado) return;
        setErro(
          e.response?.data?.erro ||
          'Não foi possível carregar os atendimentos. Tente novamente.',
        );
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    carregar();
    return () => { cancelado = true; };
  }, []);

  // Centro do mapa: primeiro ponto com coordenadas, ou São Paulo
  const centro = itens[0]
    ? [Number(itens[0].latitude), Number(itens[0].longitude)]
    : CENTRO_PADRAO;

  if (loading) {
    return (
      <section className="panel map-panel">
        <div className="panel-title">
          <h2>Atendimentos no mapa</h2>
        </div>
        <div className="loading">Carregando mapa da equipe...</div>
      </section>
    );
  }

  if (erro) {
    return (
      <section className="panel map-panel">
        <div className="panel-title">
          <h2>Atendimentos no mapa</h2>
        </div>
        <div className="alert" role="alert">
          {erro}
          <button onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel map-panel">
      <div className="panel-title">
        <div>
          <h2>Atendimentos no mapa</h2>
          <p>
            {itens.length > 0
              ? `${itens.length} endereço${itens.length > 1 ? 's' : ''} com coordenadas`
              : 'Nenhum atendimento com coordenadas disponível'}
          </p>
        </div>
      </div>

      <MapContainer
        center={centro}
        zoom={itens.length > 0 ? 11 : 6}
        style={{ height: '65vh', borderRadius: 16 }}
      >
        <TileLayer
          attribution="© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {itens.map((item) => (
          <Marker
            key={item.id}
            position={[Number(item.latitude), Number(item.longitude)]}
          >
            <Popup>
              <b>O.S. #{item.id} · {item.cliente_nome}</b>
              <br />
              {item.tecnico_nome}
              <br />
              {item.endereco}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
}
