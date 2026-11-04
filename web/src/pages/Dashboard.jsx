import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {useRealtimeRefresh} from '../hooks/useRealtimeRefresh';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const Card = ({ title, value }) => <article className="metric"><small>{title}</small><strong>{value ?? 0}</strong></article>;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filtros,setFiltros] = useState({ inicio:'',fim:'',tecnico_id:'',tipo_servico:'' });
  const [aplicados,setAplicados] = useState({});
  const [pendentes,setPendentes] = useState([]);
  const [tecnicos,setTecnicos] = useState([]);
  const [carregando,setCarregando] = useState(false);
  const [versao,setVersao]=useState(0);
  useRealtimeRefresh('agenda',()=>setVersao(v=>v+1));
  useEffect(() => { api.get('/tecnicos').then(r=>setTecnicos(r.data)).catch(()=>{}); }, []);
  useEffect(() => {
    let ativo=true; setError(''); setCarregando(true);
    Promise.all([api.get('/relatorios/gerencial',{params:aplicados}),api.get('/relatorios/recebimentos-pendentes',{params:aplicados})])
      .then(([r,p])=>{if(ativo){setData(r.data);setPendentes(p.data);}})
      .catch(err=>{if(ativo)setError(err.response?.data?.erro||err.message);})
      .finally(()=>{if(ativo)setCarregando(false);});
    return ()=>{ativo=false;};
  }, [aplicados,versao]);
  const exportar=async()=>{try{const r=await api.get('/relatorios/exportar',{params:aplicados,responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download='ordens-servico.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError('Falha ao exportar. Reduza o período e tente novamente.');}};
  return <>
    <form className="panel" onSubmit={e=>{e.preventDefault();setAplicados(Object.fromEntries(Object.entries(filtros).filter(([,v])=>v!=='')));}}>
      <h2>Período e filtros</h2><div className="catalog-filters">
        <label>Início<input type="date" value={filtros.inicio} onChange={e=>setFiltros({...filtros,inicio:e.target.value})}/></label>
        <label>Fim<input type="date" value={filtros.fim} onChange={e=>setFiltros({...filtros,fim:e.target.value})}/></label>
        <select aria-label="Técnico" value={filtros.tecnico_id} onChange={e=>setFiltros({...filtros,tecnico_id:e.target.value})}><option value="">Toda a equipe</option>{tecnicos.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}</select>
        <select aria-label="Serviço" value={filtros.tipo_servico} onChange={e=>setFiltros({...filtros,tipo_servico:e.target.value})}><option value="">Todos os serviços</option>{['LIMPEZA','INSTALACAO','REMOCAO','PREVENTIVA','PROBLEMA_TECNICO'].map(t=><option key={t}>{t}</option>)}</select>
        <button className="primary" disabled={carregando}>Aplicar</button><button type="button" disabled={carregando} onClick={exportar}>Exportar CSV</button>
      </div><p>Ordens por data de criação; recebimentos por data de pagamento. Sem filtros: últimos 90 dias.</p>
    </form>
    {error&&<div className="alert" role="alert">{error}</div>}{carregando&&<div className="loading">Carregando...</div>}
    {data&&<>
    <section className="metrics">
      <Card title={`Ordens (${data.periodo_dias} dias)`} value={data.total}/><Card title="Finalizadas" value={data.finalizadas}/><Card title="Em atendimento" value={data.em_andamento}/><Card title="Atrasadas" value={data.atrasadas}/><Card title="Pausadas" value={data.pausadas}/><Card title="Retornos" value={data.retornos}/><Card title="Primeira resolução" value={`${data.primeira_resolucao_pct || 0}%`}/><Card title="Faturado" value={money(data.faturado)}/><Card title="Recebido" value={money(data.recebido)}/><Card title="Contratos ativos" value={data.contratos?.ativos}/><Card title="Tempo médio efetivo" value={`${data.tempo_medio_horas || 0}h`}/>
    </section>
    <div className="grid2">
      <section className="panel"><h2>Desempenho da equipe</h2><table><thead><tr><th>Técnico</th><th>Atendimentos</th><th>Finalizadas</th><th>Conversão</th></tr></thead><tbody>{data.tecnicos?.map((item) => <tr key={item.nome}><td>{item.nome}</td><td>{item.atendimentos}</td><td>{item.finalizadas}</td><td>{item.atendimentos ? Math.round(100 * item.finalizadas / item.atendimentos) : 0}%</td></tr>)}</tbody></table></section>
      <section className="panel"><h2>Demanda por serviço</h2>{data.servicos?.map((item) => <div className="line" key={item.tipo_servico}><span>{item.tipo_servico.replaceAll('_', ' ')}</span><b>{item.total} · {money(item.valor)}</b></div>)}</section>
    </div>
    <section className="panel"><h2>Recebimentos pendentes</h2><p>Ordens finalizadas com saldo. O sistema ainda não registra vencimento formal da cobrança.</p>{pendentes.map(o=><div className="line" key={o.id}><span>O.S. #{o.id} · {o.cliente}</span><strong>{money(o.saldo_pendente)}</strong></div>)}{!pendentes.length&&<p>Nenhum saldo pendente no período.</p>}</section>
    </>}
  </>;
}
