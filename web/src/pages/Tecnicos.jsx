import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

const vazio = { nome: '', email: '', senha: '', confirmar: '' };

export default function Tecnicos() {
  const [tecnicos, setTecnicos] = useState([]);
  const [form, setForm] = useState(vazio);
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setTecnicos((await api.get('/configuracoes/tecnicos')).data); }
    catch (e) { setErro(e.response?.data?.erro || 'Falha ao carregar a equipe.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (event) => {
    event.preventDefault(); setErro('');
    if (form.senha !== form.confirmar) return setErro('As senhas não conferem.');
    if (form.senha.length < 8) return setErro('A senha inicial deve ter pelo menos 8 caracteres.');
    setSalvando(true);
    try {
      await api.post('/configuracoes/tecnicos', { nome: form.nome.trim(), email: form.email.trim(), senha: form.senha });
      setForm(vazio); setAberto(false); setMsg('Técnico cadastrado. Ele já pode entrar no aplicativo.');
      await carregar();
    } catch (e) {
      const dados = e.response?.data;
      const detalhes = dados?.detalhes?.map((item) => `${item.campo}: ${item.mensagem}`).join(' · ');
      setErro(detalhes ? `${dados.erro} ${detalhes}` : dados?.erro || 'Falha ao cadastrar técnico.');
    } finally { setSalvando(false); }
  };

  return <>
    <section className="panel">
      <div className="panel-title"><div><h2>Equipe técnica</h2><p>Cadastre os profissionais que acessarão o aplicativo e receberão atendimentos.</p></div><button className="primary" onClick={() => { setErro(''); setForm(vazio); setAberto(true); }}>+ Novo técnico</button></div>
      {erro && !aberto && <div className="alert">{erro}<button onClick={() => setErro('')}>×</button></div>}
      {loading ? <div className="loading">Carregando equipe...</div> : <div className="table-scroll"><table><thead><tr><th>Nome</th><th>E-mail de acesso</th><th>Status</th><th>Cadastrado em</th></tr></thead><tbody>{tecnicos.map((item) => <tr key={item.id}><td><b>{item.nome}</b></td><td>{item.email}</td><td><span className={`kind ${item.ativo ? 'service' : 'piece'}`}>{item.ativo ? 'ATIVO' : 'INATIVO'}</span></td><td>{new Date(item.created_at).toLocaleDateString('pt-BR')}</td></tr>)}</tbody></table></div>}
      {!loading && !tecnicos.length && <div className="empty">Nenhum técnico cadastrado.</div>}
    </section>
    {aberto && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}><section className="schedule-modal"><div className="modal-title"><div><span className="eyebrow">NOVO ACESSO</span><h2>Cadastrar técnico</h2><p>Informe uma senha inicial e envie as credenciais ao profissional.</p></div><button onClick={() => setAberto(false)}>×</button></div>{erro && <div className="alert">{erro}<button onClick={() => setErro('')}>×</button></div>}<form onSubmit={salvar}><label>Nome completo *</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} minLength="3" maxLength="150" required autoFocus/><label>E-mail de acesso *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength="150" required/><div className="form-grid"><div><label>Senha inicial *</label><input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} minLength="8" maxLength="100" required/></div><div><label>Confirmar senha *</label><input type="password" value={form.confirmar} onChange={(e) => setForm({ ...form, confirmar: e.target.value })} minLength="8" maxLength="100" required/></div></div><div className="modal-actions"><button type="button" onClick={() => setAberto(false)}>Cancelar</button><button className="primary" disabled={salvando}>{salvando ? 'Cadastrando...' : 'Cadastrar técnico'}</button></div></form></section></div>}
    {msg && <div className="toast" onClick={() => setMsg('')}>{msg}</div>}
  </>;
}
