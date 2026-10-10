import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import '../whatsapp.css';
import '../whatsapp-tabs.css';

const FILAS = [['ATENDENDO', 'Atendendo'], ['ESPERA', 'Espera'], ['AUTOMACAO', 'Automação']];
const hora = (data) => data ? new Date(data).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
const nome = (item) => item?.cliente_nome || item?.nome_contato || item?.telefone || 'Contato';

export default function WhatsApp() {
  const [conversas, setConversas] = useState([]);
  const [selecionada, setSelecionada] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [fila, setFila] = useState('ATENDENDO');
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [assumindo, setAssumindo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [aviso, setAviso] = useState('');
  const fimMensagens = useRef(null);

  const carregarConversas = useCallback(async () => {
    try { setConversas((await api.get('/atendimento/whatsapp/conversas')).data); }
    catch (e) { setErro(e.response?.data?.erro || 'Falha ao carregar conversas.'); }
  }, []);
  const abrir = useCallback(async (item, silencioso = false) => {
    try {
      const dados = (await api.get(`/atendimento/whatsapp/conversas/${item.id}`)).data;
      setSelecionada(dados.conversa); setMensagens(dados.mensagens);
      if (!silencioso) await carregarConversas();
    } catch (e) { setErro(e.response?.data?.erro || 'Falha ao abrir conversa.'); }
  }, [carregarConversas]);

  useEffect(() => { carregarConversas(); const timer = setInterval(carregarConversas, 8000); return () => clearInterval(timer); }, [carregarConversas]);
  useEffect(() => { if (!selecionada) return undefined; const timer = setInterval(() => abrir(selecionada, true), 5000); return () => clearInterval(timer); }, [selecionada, abrir]);
  useEffect(() => { fimMensagens.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensagens, selecionada?.id]);

  const contagem = useMemo(() => conversas.reduce((total, item) => ({ ...total, [item.fila_status || 'AUTOMACAO']: (total[item.fila_status || 'AUTOMACAO'] || 0) + 1 }), {}), [conversas]);
  const filtradas = useMemo(() => conversas.filter((item) => (item.fila_status || 'AUTOMACAO') === fila).filter((item) => `${nome(item)} ${item.telefone}`.toLowerCase().includes(busca.toLowerCase())), [conversas, busca, fila]);
  const janelaAberta = selecionada?.janela_atendimento_ate && new Date(selecionada.janela_atendimento_ate) > new Date();

  const assumir = async () => {
    setAssumindo(true); setErro('');
    try {
      const { data } = await api.post(`/atendimento/whatsapp/conversas/${selecionada.id}/assumir`);
      setSelecionada(data); setFila('ATENDENDO'); await carregarConversas(); await abrir(data, true);
    } catch (e) { setErro(e.response?.data?.erro || 'Falha ao assumir atendimento.'); }
    finally { setAssumindo(false); }
  };
  const enviar = async (event) => {
    event.preventDefault(); if (!texto.trim() || !selecionada || enviando) return;
    setEnviando(true); setErro('');
    try {
      await api.post(`/atendimento/whatsapp/conversas/${selecionada.id}/mensagens`, { texto: texto.trim() });
      setTexto(''); setFila('ATENDENDO'); await carregarConversas(); await abrir({ ...selecionada, fila_status:'ATENDENDO' }, true);
    } catch (e) { setErro(e.response?.data?.erro || 'Falha ao enviar mensagem.'); }
    finally { setEnviando(false); }
  };
  const encerrar = async () => {
    if (!window.confirm('Encerrar este atendimento? Se o cliente falar novamente, ele voltará para a automação.')) return;
    setEncerrando(true); setErro('');
    try {
      await api.post(`/atendimento/whatsapp/conversas/${selecionada.id}/encerrar`);
      setSelecionada(null); setMensagens([]); setAviso('Atendimento encerrado. Uma nova mensagem do cliente reiniciará a automação.');
      await carregarConversas();
    } catch (e) { setErro(e.response?.data?.erro || 'Falha ao encerrar atendimento.'); }
    finally { setEncerrando(false); }
  };

  return <section className="wa-page">
    <aside className="wa-list">
      <div className="wa-list-head"><div><h2>WhatsApp</h2><p>Central de atendimento</p></div><button onClick={carregarConversas} title="Atualizar">↻</button></div>
      <div className="wa-tabs">{FILAS.map(([id, label]) => <button key={id} className={fila === id ? 'active' : ''} onClick={() => { setFila(id); setSelecionada(null); }}>{label}<b>{contagem[id] || 0}</b></button>)}</div>
      <input placeholder="Buscar contato..." value={busca} onChange={(e) => setBusca(e.target.value)}/>
      <div className="wa-conversations">{filtradas.map((item) => <button key={item.id} className={selecionada?.id === item.id ? 'active' : ''} onClick={() => abrir(item)}><span className="wa-avatar">{nome(item).slice(0,1).toUpperCase()}</span><span className="wa-preview"><b>{nome(item)}</b><small>{item.ultima_mensagem || 'Nova conversa'}</small></span><span className="wa-side"><small>{hora(item.ultima_mensagem_em)}</small>{item.nao_lidas > 0 && <i>{item.nao_lidas}</i>}</span></button>)}</div>
      {!filtradas.length && <div className="wa-empty">Nenhuma conversa nesta fila.</div>}
    </aside>
    <div className="wa-chat">{selecionada ? <>
      <header><div className="wa-avatar">{nome(selecionada).slice(0,1).toUpperCase()}</div><div><b>{nome(selecionada)}</b><small>+{selecionada.telefone}{selecionada.atendente_nome ? ` · ${selecionada.atendente_nome}` : ''}</small></div>{selecionada.fila_status !== 'ATENDENDO' ? <button className="wa-claim" onClick={assumir} disabled={assumindo}>{assumindo ? 'Assumindo...' : 'Assumir atendimento'}</button> : <button className="wa-close-service" onClick={encerrar} disabled={encerrando}>{encerrando ? 'Encerrando...' : 'Encerrar atendimento'}</button>}<span className={janelaAberta ? 'wa-window open' : 'wa-window'}>{janelaAberta ? 'Janela aberta' : 'Janela encerrada'}</span></header>
      {erro && <div className="alert">{erro}<button onClick={() => setErro('')}>×</button></div>}
      <div className="wa-messages">{mensagens.map((item) => <div key={item.id} className={`wa-message ${item.direcao === 'SAIDA' ? 'out' : 'in'}`}><p>{item.conteudo}</p><small>{hora(item.ocorrida_em)}{item.direcao === 'SAIDA' ? ` · ${item.status}` : ''}</small></div>)}<div ref={fimMensagens} className="wa-scroll-anchor"/></div>
      <form className="wa-compose" onSubmit={enviar}><textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={janelaAberta ? 'Digite uma mensagem...' : 'Aguarde o cliente enviar uma mensagem ou use um template aprovado.'} maxLength="4096" disabled={!janelaAberta}/><button className="primary" disabled={!janelaAberta || enviando || !texto.trim()}>{enviando ? 'Enviando...' : 'Enviar'}</button></form>
    </> : <div className="wa-placeholder"><span>◉</span><h2>Atendimento pelo WhatsApp</h2><p>Selecione uma conversa para visualizar o histórico e responder ao cliente.</p>{aviso && <div className="wa-success">{aviso}</div>}{erro && <div className="alert">{erro}</div>}</div>}</div>
  </section>;
}
