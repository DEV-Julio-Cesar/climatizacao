import React, { useState } from 'react';
import { api } from '../services/api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const entrar = async (event) => {
    event.preventDefault();
    setLoading(true);
    setErro('');
    try {
      const { data } = await api.post('/login', { email, senha });
      onLogin(data.token, data.usuario);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Não foi possível entrar. Verifique os dados e tente novamente.');
    } finally { setLoading(false); }
  };

  return <div className="login">
    <div className="login-visual">
      <div className="login-brand"><span className="brand-mark">❄</span>ClimaSaaS</div>
      <div><span className="eyebrow light">GESTÃO DE CLIMATIZAÇÃO</span><h1>Sua operação,<br/>sob controle.</h1><p>Agenda, equipe, clientes e resultados em um único painel.</p></div>
      <small>Do chamado à conclusão do serviço.</small>
    </div>
    <form onSubmit={entrar}>
      <div className="login-mobile-brand"><span className="brand-mark">❄</span> ClimaSaaS</div>
      <span className="eyebrow">ACESSO AO PAINEL</span>
      <h2>Bem-vindo de volta</h2>
      <p>Entre com sua conta para continuar.</p>
      <label htmlFor="email">E-mail</label>
      <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
      <label htmlFor="senha">Senha</label>
      <input id="senha" value={senha} onChange={(e) => setSenha(e.target.value)} type="password" autoComplete="current-password" required />
      {erro && <div className="error" role="alert">{erro}</div>}
      <button className="primary" disabled={loading}>{loading ? 'Entrando...' : 'Entrar no painel'}<span>→</span></button>
    </form>
  </div>;
}
