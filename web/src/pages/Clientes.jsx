import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Clientes() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api.get('/clientes').then((response) => setItems(response.data)).catch((err) => setError(err.response?.data?.erro || 'Não foi possível carregar os clientes.')); }, []);
  const list = items.filter((item) => `${item.nome} ${item.endereco || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="panel">
    <div className="panel-title"><div><h2>Clientes e equipamentos</h2><p>Cadastros disponíveis para atendimento</p></div><input className="search" placeholder="Buscar cliente..." value={search} onChange={(event) => setSearch(event.target.value)}/></div>
    {error ? <div className="empty">{error}</div> : list.length ? <div className="cards">{list.map((client) => <article className="client-card" key={client.id}><div className="avatar">{client.nome[0]}</div><div><h3>{client.nome}</h3><p>{client.telefone || 'Sem telefone'}</p><p>{client.endereco || 'Endereço não informado'}</p><small>{client.aparelhos?.length || 0} equipamento(s) · {client.latitude ? 'Localizado no mapa' : 'Sem coordenadas'}</small></div></article>)}</div> : <div className="empty">Nenhum cliente encontrado.</div>}
  </section>;
}
