import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const Card = ({ title, value }) => <article className="metric"><small>{title}</small><strong>{value ?? 0}</strong></article>;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/relatorios/gerencial').then((response) => setData(response.data)).catch((err) => setError(err.response?.data?.erro || err.message)); }, []);
  if (error) return <div className="empty">{error}</div>;
  if (!data) return <div className="loading">Carregando indicadores...</div>;
  return <>
    <section className="metrics">
      <Card title="Ordens (90 dias)" value={data.total}/><Card title="Finalizadas" value={data.finalizadas}/><Card title="Em atendimento" value={data.em_andamento}/><Card title="Atrasadas" value={data.atrasadas}/><Card title="Pausadas" value={data.pausadas}/><Card title="Retornos" value={data.retornos}/><Card title="Primeira resolução" value={`${data.primeira_resolucao_pct || 0}%`}/><Card title="Faturado" value={money(data.faturado)}/><Card title="Recebido" value={money(data.recebido)}/><Card title="Contratos ativos" value={data.contratos?.ativos}/><Card title="Tempo médio efetivo" value={`${data.tempo_medio_horas || 0}h`}/>
    </section>
    <div className="grid2">
      <section className="panel"><h2>Desempenho da equipe</h2><table><thead><tr><th>Técnico</th><th>Atendimentos</th><th>Finalizadas</th><th>Conversão</th></tr></thead><tbody>{data.tecnicos?.map((item) => <tr key={item.nome}><td>{item.nome}</td><td>{item.atendimentos}</td><td>{item.finalizadas}</td><td>{item.atendimentos ? Math.round(100 * item.finalizadas / item.atendimentos) : 0}%</td></tr>)}</tbody></table></section>
      <section className="panel"><h2>Demanda por serviço</h2>{data.servicos?.map((item) => <div className="line" key={item.tipo_servico}><span>{item.tipo_servico.replaceAll('_', ' ')}</span><b>{item.total} · {money(item.valor)}</b></div>)}</section>
    </div>
  </>;
}
