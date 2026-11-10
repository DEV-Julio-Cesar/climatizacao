import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, BASE_URL, limparSessao } from '../services/api';
import HistoricoPrivacidade from './HistoricoPrivacidade';

const tipos = { ACESSO: 'Acesso aos dados', CORRECAO: 'Correção', EXCLUSAO: 'Avaliação de exclusão', INFORMACAO: 'Informações sobre tratamento', OPOSICAO: 'Oposição ao tratamento' };
export default function PrivacidadeConta() {
  const [dados, setDados] = useState({ solicitacoes: [], pode_gerenciar: false, tem_mais: false });
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ status: '', tipo: '', protocolo: '' });
  const [buscaProtocolo, setBuscaProtocolo] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [historicoAberto, setHistoricoAberto] = useState(null);
  const [revisao, setRevisao] = useState(0);
  const pedidoPendente = useRef(null), emExecucao = useRef(false), leitura = useRef(0), carregarAtual = useRef(null);
  const [form, setForm] = useState({ tipo: 'ACESSO', descricao: '', cliente_id: '' });
  const [respostas, setRespostas] = useState({});
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [fimResumo, setFimResumo] = useState(false);
  const carregar = useCallback(async () => {
    const versao = ++leitura.current; setCarregando(true); setErro('');
    setDados(anterior => ({ ...anterior, solicitacoes: [], tem_mais: false }));
    try {
      const params = { pagina, ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) };
      const { data } = await api.get('/privacidade/solicitacoes', { params });
      if (versao === leitura.current) setDados(data);
    } catch (error) { if (versao === leitura.current) throw error; }
    finally { if (versao === leitura.current) setCarregando(false); }
  }, [pagina, filtros]);
  carregarAtual.current = carregar;
  useEffect(() => { setHistoricoAberto(null); carregar().catch(e => setErro(e.response?.data?.erro || 'Não foi possível carregar os protocolos. Tente atualizar.')); return () => { leitura.current++; }; }, [carregar]);
  async function executar(acao) {
    if (emExecucao.current) return;
    emExecucao.current = true;
    setOcupado(true); setErro(''); setAviso('');
    try { await acao(); } catch (e) { setErro(e.response?.data?.erro || 'Não foi possível confirmar a operação. Consulte os protocolos antes de repetir um pedido.'); }
    finally { emExecucao.current = false; setOcupado(false); }
  }
  const criar = event => {
    event.preventDefault();
    executar(async () => {
      const payload = { tipo: form.tipo, descricao: form.descricao.trim() };
      if (form.cliente_id) payload.cliente_id = Number(form.cliente_id);
      const assinatura = JSON.stringify(payload);
      if (pedidoPendente.current?.assinatura !== assinatura) pedidoPendente.current = { assinatura, chave: crypto.randomUUID() };
      const { data } = await api.post('/privacidade/solicitacoes', payload, { headers: { 'Idempotency-Key': pedidoPendente.current.chave } });
      setAviso(`Protocolo ${data.protocolo}. ${data.mensagem}`);
      setForm({ tipo: 'ACESSO', descricao: '', cliente_id: '' });
      pedidoPendente.current = null;
      if (pagina === 1) await carregarAtual.current(); else setPagina(1);
    });
  };
  const atualizar = (pedido, status) => executar(async () => {
    await api.patch(`/privacidade/solicitacoes/${pedido.protocolo}`, { status, resposta: respostas[pedido.protocolo] || '' });
    setRespostas(anteriores => ({ ...anteriores, [pedido.protocolo]: '' }));
    await carregarAtual.current(); setRevisao(v => v + 1); setAviso('Andamento registrado. Atualizar o protocolo não apaga dados automaticamente.');
  });
  const resumo = () => executar(async () => {
    const { data } = await api.get('/conta/dados', { params: { cursor, limite: 100 } });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `resumo-conta-${cursor}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (data.paginacao.tem_mais) setCursor(data.paginacao.proximo_cursor); else setFimResumo(true);
    setAviso(data.paginacao.tem_mais ? 'Página baixada. Baixe a próxima para continuar o resumo.' : 'Última página do resumo baixada. Para acesso a outros registros, abra uma solicitação.');
  });
  const excluir = event => {
    event.preventDefault();
    if (!confirmacao || !window.confirm('Desativar sua conta e encerrar todas as sessões? Você perderá o acesso ao painel. Guarde os protocolos antes de continuar.')) return;
    executar(async () => {
      await api.delete('/conta/dados', { data: { confirmacao: 'CONFIRMAR_EXCLUSAO', senha_atual: senha } });
      setSenha(''); limparSessao();
      window.alert('Conta desativada e sessões revogadas. Registros vinculados não foram eliminados; acompanhe solicitações com a empresa responsável.');
      window.dispatchEvent(new Event('climasaas:session-expired'));
    });
  };
  return <section className="panel account-card" aria-labelledby="privacidade-titulo">
    <span className="eyebrow">PROTEÇÃO DE DADOS</span><h2 id="privacidade-titulo">Privacidade</h2>
    <p><a href={`${BASE_URL}/privacidade`} target="_blank" rel="noreferrer">Leia o aviso de privacidade e os canais de atendimento</a>.</p>
    {erro && <div className="alert" role="alert">{erro}</div>}
    {aviso && <p role="status" style={{ overflowWrap: 'anywhere' }}>{aviso}</p>}
    <h3>Resumo da minha conta</h3>
    <p>Download por páginas, com até 100 ordens atribuídas em cada arquivo. Não inclui todos os registros pessoais, fotos e documentos. Para acesso completo, abra uma solicitação.</p>
    <button type="button" disabled={ocupado || fimResumo} onClick={resumo}>{fimResumo ? 'Resumo baixado' : cursor ? 'Baixar próxima página' : 'Baixar primeira página (JSON)'}</button>
    {fimResumo && <button type="button" disabled={ocupado} onClick={() => { setFimResumo(false); setCursor(0); }}>Reiniciar download</button>}
    <h3>Registrar solicitação</h3>
    <p>Descreva o pedido sem enviar senhas, documentos ou dados de outras pessoas. Guarde o protocolo; a análise não executa exclusão automática.</p>
    <form onSubmit={criar}>
      <label htmlFor="priv-tipo">Tipo de solicitação</label><select id="priv-tipo" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>{Object.entries(tipos).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}</select>
      {dados.pode_registrar_cliente && <><label htmlFor="priv-cliente">Número do cliente (somente para pedido recebido de cliente)</label><input id="priv-cliente" type="number" min="1" step="1" value={form.cliente_id} onChange={e => setForm({ ...form, cliente_id: e.target.value })}/><small>Deixe vazio para pedido sobre sua conta. Verifique a identidade do cliente por canal adequado; não registre documentos aqui.</small></>}
      <label htmlFor="priv-descricao">Descrição</label><textarea id="priv-descricao" required minLength={10} maxLength={2000} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}/>
      <button className="primary" disabled={ocupado || carregando}>Registrar e gerar protocolo</button>
    </form>
    <h3>{dados.pode_gerenciar ? 'Solicitações da empresa' : 'Minhas solicitações'}</h3>
    <div className="privacy-filters">
      <label htmlFor="priv-status">Situação</label><select id="priv-status" value={filtros.status} onChange={e => { setPagina(1); setFiltros({ ...filtros, status: e.target.value }); }}><option value="">Todas</option><option value="RECEBIDA">Recebida</option><option value="EM_ANALISE">Em análise</option><option value="CONCLUIDA">Concluída</option></select>
      <label htmlFor="priv-filtro-tipo">Tipo</label><select id="priv-filtro-tipo" value={filtros.tipo} onChange={e => { setPagina(1); setFiltros({ ...filtros, tipo: e.target.value }); }}><option value="">Todos</option>{Object.entries(tipos).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}</select>
      <form onSubmit={e => { e.preventDefault(); setPagina(1); setFiltros({ ...filtros, protocolo: buscaProtocolo.trim() }); }}><label htmlFor="priv-busca">Protocolo completo</label><input id="priv-busca" value={buscaProtocolo} onChange={e => setBuscaProtocolo(e.target.value)} maxLength={36}/><button type="submit" disabled={ocupado}>Buscar protocolo</button></form>
      <button type="button" disabled={ocupado} onClick={() => { setPagina(1); setBuscaProtocolo(''); setFiltros({ status: '', tipo: '', protocolo: '' }); setErro(''); }}>Limpar filtros</button>
    </div>
    <button type="button" disabled={ocupado || carregando} onClick={() => executar(carregar)}>Atualizar protocolos</button>
    {carregando && <p role="status">Carregando protocolos...</p>}
    {!carregando && !dados.solicitacoes.length && <p>Nenhuma solicitação para os filtros selecionados.</p>}
    {!carregando && dados.solicitacoes.map(pedido => <article key={pedido.protocolo} style={{ marginBlock: 20, overflowWrap: 'anywhere' }}>
      <strong>{tipos[pedido.tipo]} — {pedido.status.replaceAll('_', ' ')}</strong>
      <p>Protocolo: {pedido.protocolo}<br/>Recebido em: {new Date(pedido.created_at).toLocaleString('pt-BR')}{pedido.cliente_id ? ` · Cliente #${pedido.cliente_id}` : ''}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{pedido.descricao}</p>
      {pedido.resposta && <p style={{ whiteSpace: 'pre-wrap' }}>Resposta: {pedido.resposta}</p>}
      <button type="button" aria-expanded={historicoAberto === pedido.protocolo} onClick={() => setHistoricoAberto(historicoAberto === pedido.protocolo ? null : pedido.protocolo)}>{historicoAberto === pedido.protocolo ? 'Fechar histórico' : 'Ver histórico completo'}</button>
      {historicoAberto === pedido.protocolo && <HistoricoPrivacidade protocolo={pedido.protocolo} revisao={revisao}/>}
      {dados.pode_gerenciar && pedido.status !== 'CONCLUIDA' && <>
        <label htmlFor={`resposta-${pedido.protocolo}`}>Andamento ou resposta (sem documentos ou dados de terceiros)</label>
        <textarea id={`resposta-${pedido.protocolo}`} minLength={10} maxLength={4000} value={respostas[pedido.protocolo] || ''} onChange={e => setRespostas({ ...respostas, [pedido.protocolo]: e.target.value })}/>
        <button type="button" disabled={ocupado || (respostas[pedido.protocolo] || '').trim().length < 10} onClick={() => atualizar(pedido, pedido.status === 'RECEBIDA' ? 'EM_ANALISE' : 'CONCLUIDA')}>{pedido.status === 'RECEBIDA' ? 'Iniciar análise' : 'Concluir com resposta'}</button>
      </>}
    </article>)}
    <div><button type="button" disabled={ocupado || pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button> <span>Página {pagina}</span> <button type="button" disabled={ocupado || !dados.tem_mais} onClick={() => setPagina(pagina + 1)}>Próxima</button></div>
    <h3>Desativar conta e remover identificadores de acesso</h3>
    <p>Essa ação encerra as sessões e impede novo acesso. Não elimina fotos, PDFs, histórico de serviços, backups ou dados offline dos aparelhos. Para avaliação desses registros, abra um pedido de exclusão antes de desativar e guarde o protocolo.</p>
    <form onSubmit={excluir}>
      <label htmlFor="priv-senha">Confirme sua senha atual</label><input id="priv-senha" type="password" autoComplete="current-password" required minLength={6} maxLength={200} value={senha} onChange={e => setSenha(e.target.value)}/>
      <label><input type="checkbox" checked={confirmacao} onChange={e => setConfirmacao(e.target.checked)}/> Entendo o alcance da desativação e guardei meus protocolos.</label>
      <button type="submit" disabled={ocupado || !confirmacao || !senha}>Desativar minha conta</button>
    </form>
  </section>;
}
