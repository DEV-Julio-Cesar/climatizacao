import React, { useState } from 'react';
import { api } from '../services/api';

export default function MinhaConta() {
  const [form, setForm] = useState({ atual:'', nova:'', confirmar:'' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async (event) => {
    event.preventDefault(); setErro('');
    if (form.nova !== form.confirmar) return setErro('A confirmação não corresponde à nova senha.');
    if (form.nova.length < 8 || !/[A-Za-z]/.test(form.nova) || !/[0-9]/.test(form.nova)) return setErro('Use pelo menos 8 caracteres, com letras e números.');
    setSalvando(true);
    try {
      await api.post('/conta/senha', { senha_atual:form.atual, nova_senha:form.nova });
      localStorage.removeItem('climasaas_token'); localStorage.removeItem('climasaas_usuario');
      window.dispatchEvent(new Event('climasaas:session-expired'));
    } catch (e) { setErro(e.response?.data?.erro || 'Falha ao alterar senha.'); }
    finally { setSalvando(false); }
  };
  return <div className="account-grid"><section className="panel account-card"><span className="eyebrow">SEGURANÇA</span><h2>Alterar minha senha</h2><p>Depois da alteração, você entrará novamente usando a nova senha.</p>{erro&&<div className="alert">{erro}</div>}<form onSubmit={salvar}><label>Senha atual</label><input type="password" autoComplete="current-password" value={form.atual} onChange={e=>setForm({...form,atual:e.target.value})} required/><label>Nova senha</label><input type="password" autoComplete="new-password" value={form.nova} onChange={e=>setForm({...form,nova:e.target.value})} minLength="8" required/><label>Confirmar nova senha</label><input type="password" autoComplete="new-password" value={form.confirmar} onChange={e=>setForm({...form,confirmar:e.target.value})} minLength="8" required/><small>Use no mínimo 8 caracteres, contendo letras e números.</small><button className="primary" disabled={salvando}>{salvando?'Alterando...':'Alterar senha'}</button></form></section></div>;
}
