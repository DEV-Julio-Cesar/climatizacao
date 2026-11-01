import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-';
const Card = ({ title, value }) => <article className="metric"><small>{title}</small><strong>{value ?? 0}</strong></article>;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [inadimplencia, setInadimplencia] = useState(null);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState('');

  useEffect(() => {
    Promise.all([api.get('/relatorios/gerencial'), api.get('/relatorios/inadimplencia')])
      .then(([gerencial, pendencias]) => { setData(gerencial.data); setInadimplencia(pendencias.data); })
      .catch((err) => setError(err.response?.data?.erro || err.message));
  }, []);

  async function exportar(tipo) {
    setExportando(tipo);
    try {
      const response = await api.get('/relatorios/exportar', { params: { tipo }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${tipo}_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (_error) { setError('Não foi possível exportar o relatório.'); }
    finally { setExportando(''); }
  }

  if (error && !data) return <div className="empty">{error}</div>;
  if (!data || !inadimplencia) return <div className="loading">Carregando indicadores...</div>;
  return <>
    <section className="panel report-toolbar"><div><h2>Relatórios gerenciais</h2><p>Dados separados por empresa e arquivos compatíveis com Excel.</p></div><div className="toolbar-actions">
      {['os', 'pagamentos', 'estoque'].map((tipo) => <button className="icon-button" key={tipo} disabled={Boolean(exportando)} onClick={() => exportar(tipo)}>{exportando === tipo ? 'Gerando...' : `Exportar ${tipo}`}</button>)}
    </div></section>
    <section className="metrics">
      <Card title="Ordens (90 dias)" value={data.total}/><Card title="Finalizadas" value={data.finalizadas}/><Card title="Desistências" value={data.desistencias}/><Card title="Em atendimento" value={data.em_andamento}/><Card title="Atrasadas" value={data.atrasadas}/><Card title="Pausadas" value={data.pausadas}/><Card title="Retornos" value={data.retornos}/><Card title="Primeira resolução" value={`${data.primeira_resolucao_pct || 0}%`}/><Card title="Faturado" value={money(data.faturado)}/><Card title="Recebido" value={money(data.recebido)}/><Card title="Contratos ativos" value={data.contratos?.ativos}/><Card title="Tempo médio efetivo" value={`${data.tempo_medio_horas || 0}h`}/>
    </section>
    <section className="panel"><div className="panel-title"><div><h2>Valores em aberto</h2><p>{inadimplencia.resumo.ordens} ordens de {inadimplencia.resumo.clientes} clientes</p></div><strong className="pending-total">{money(inadimplencia.resumo.total_pendente)}</strong></div>
      <div className="table-scroll"><table><thead><tr><th>OS</th><th>Cliente</th><th>Finalizada</th><th>Dias</th><th>Total</th><th>Recebido</th><th>Saldo</th></tr></thead><tbody>
        {inadimplencia.itens.map((item) => <tr key={item.id}><td>#{item.id}</td><td><b>{item.cliente}</b><small className="cell-detail">{item.telefone || 'Sem telefone'}</small></td><td>{date(item.finalizado_em)}</td><td>{item.dias_em_aberto}</td><td>{money(item.valor_total)}</td><td>{money(item.total_pago)}</td><td className="danger"><b>{money(item.saldo_pendente)}</b></td></tr>)}
        {!inadimplencia.itens.length && <tr><td colSpan="7" className="empty compact">Nenhum valor em aberto.</td></tr>}
      </tbody></table></div>
    </section>
    <div className="grid2">
      <section className="panel"><h2>Desempenho da equipe</h2><div className="table-scroll"><table><thead><tr><th>Técnico</th><th>Atendimentos</th><th>Finalizadas</th><th>Conversão</th></tr></thead><tbody>{data.tecnicos?.map((item) => <tr key={item.nome}><td>{item.nome}</td><td>{item.atendimentos}</td><td>{item.finalizadas}</td><td>{item.atendimentos ? Math.round(100 * item.finalizadas / item.atendimentos) : 0}%</td></tr>)}</tbody></table></div></section>
      <section className="panel"><h2>Demanda por serviço</h2>{data.servicos?.map((item) => <div className="line" key={item.tipo_servico}><span>{item.tipo_servico.replaceAll('_', ' ')}</span><b>{item.total} · {money(item.valor)}</b></div>)}</section>
    </div>
  </>;
}
