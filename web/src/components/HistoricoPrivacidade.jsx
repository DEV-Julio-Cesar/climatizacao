import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

const status = { RECEBIDA: 'Recebida', EM_ANALISE: 'Em análise', CONCLUIDA: 'Concluída' };
export default function HistoricoPrivacidade({ protocolo, revisao = 0 }) {
  const [itens, setItens] = useState([]), [proximo, setProximo] = useState(null);
  const [erro, setErro] = useState(''), [loading, setLoading] = useState(true);
  const geracao = useRef(0);
  const carregar = async (cursor, sinal, versao) => {
    setErro(''); setLoading(true);
    try {
      const { data } = await api.get(`/privacidade/solicitacoes/${protocolo}`, { params: { cursor }, signal: sinal });
      if (versao !== geracao.current) return;
      setItens(anteriores => cursor ? [...anteriores, ...data.historico.filter(i => !anteriores.some(a => a.id === i.id))] : data.historico);
      setProximo(data.paginacao.proximo_cursor);
    } catch (e) { if (!sinal?.aborted && versao === geracao.current) { if ([403, 404].includes(e.response?.status)) { setItens([]); setProximo(null); } setErro(e.response?.data?.erro || 'Não foi possível carregar o histórico.'); } }
    finally { if (versao === geracao.current) setLoading(false); }
  };
  useEffect(() => {
    const controller = new AbortController(), versao = ++geracao.current;
    setItens([]); setProximo(null); void carregar(0, controller.signal, versao);
    return () => { controller.abort(); geracao.current++; };
  }, [protocolo, revisao]);
  return <section className="privacy-history" aria-label="Histórico da solicitação">
    <h4>Histórico do protocolo</h4>
    {erro && <p role="alert">{erro} <button type="button" disabled={loading} onClick={() => carregar(proximo || 0, undefined, geracao.current)}>Tentar novamente</button></p>}
    <ol>{itens.map(i => <li key={i.id}><strong>{status[i.status] || i.status}</strong><small>{new Date(i.created_at).toLocaleString('pt-BR')}</small>{i.resposta && <p>{i.resposta}</p>}</li>)}</ol>
    {loading && <p role="status">Carregando histórico...</p>}
    {!loading && !erro && !itens.length && <p>Nenhum andamento registrado.</p>}
    {proximo && <button type="button" disabled={loading} onClick={() => carregar(proximo, undefined, geracao.current)}>Carregar mais andamentos</button>}
  </section>;
}
