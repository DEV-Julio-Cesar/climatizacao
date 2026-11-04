import React,{useState} from 'react';
import {api,limparSessao} from '../services/api';
export default function RecuperarSenha({token,onVoltar}){
  const redefinir=token!==undefined;
  const [email,setEmail]=useState(''),[senha,setSenha]=useState(''),[confirmacao,setConfirmacao]=useState(''),[erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[loading,setLoading]=useState(false),[concluido,setConcluido]=useState(false);
  const enviar=async e=>{
    e.preventDefault();setErro('');setMensagem('');
    if(redefinir&&(!/^[A-Za-z0-9_-]{43}$/.test(token)||senha!==confirmacao||senha.length<8||senha.length>100||!/[A-Za-z]/.test(senha)||!/[0-9]/.test(senha)))return setErro('Confira o link e informe senhas iguais, de 8 a 100 caracteres com letras e números.');
    setLoading(true);
    try{
      const {data}=await api.post(redefinir?'/auth/senha/redefinir':'/auth/senha/solicitar',redefinir?{token,nova_senha:senha}:{email:email.trim()});
      setMensagem(data.mensagem);
      if(redefinir){limparSessao();setSenha('');setConfirmacao('');setConcluido(true);}
    }catch(e){setErro(e.response?.data?.erro||'Não foi possível concluir. Verifique a conexão e tente novamente.');}
    finally{setLoading(false);}
  };
  return <div className="login"><div className="login-visual"><div className="login-brand"><span className="brand-mark">❄</span>ClimaSaaS</div><div><h1>Recupere seu acesso</h1><p>O link é de uso único e expira em 15 minutos.</p></div></div>
    <form onSubmit={enviar}><h2>{redefinir?'Definir nova senha':'Esqueci minha senha'}</h2>
      {!concluido&&(redefinir?<><label htmlFor="nova-senha">Nova senha</label><input id="nova-senha" type="password" autoComplete="new-password" minLength={8} maxLength={100} value={senha} onChange={e=>setSenha(e.target.value)} required/>
      <label htmlFor="confirmar-senha">Confirmar nova senha</label><input id="confirmar-senha" type="password" autoComplete="new-password" minLength={8} maxLength={100} value={confirmacao} onChange={e=>setConfirmacao(e.target.value)} required/><p>Use letras e números. Você precisará entrar novamente nos seus dispositivos.</p></>:<><p>Informe o e-mail cadastrado. Confira a caixa de entrada e o spam.</p><label htmlFor="recuperar-email">E-mail</label><input id="recuperar-email" type="email" autoComplete="email" maxLength={150} value={email} onChange={e=>setEmail(e.target.value)} required/></>)}
      {erro&&<div className="error" role="alert">{erro}</div>}{mensagem&&<p role="status">{mensagem}</p>}
      {!concluido&&<button className="primary" disabled={loading}>{loading?'Processando...':redefinir?'Salvar nova senha':'Enviar link de recuperação'}</button>}
      <button type="button" onClick={onVoltar} disabled={loading}>Voltar ao login</button>
    </form></div>;
}
