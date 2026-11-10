import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Privacidade, { DetalhePrivacidade } from '../../mobile/src/screens/Perfil/Privacidade.js';
import { entrar } from './api';
import './styles.css';

function Harness() {
  const [conta,setConta]=useState('tecnico-a'),[logado,setLogado]=useState(false),[protocolo,setProtocolo]=useState(null),[erro,setErro]=useState('');
  if(!logado)return <form className="fixture-login" onSubmit={async e=>{e.preventDefault();try{await entrar(conta);setLogado(true);}catch(error){setErro(error.message);}}}><h1>Teste de componentes mobile</h1><label htmlFor="conta">Conta sintética</label><select id="conta" value={conta} onChange={e=>setConta(e.target.value)}><option>tecnico-a</option><option>gestor-a</option><option>gestor-limitado</option></select><button>Entrar no teste mobile</button><p>{erro}</p></form>;
  return <div className="native-root">{protocolo?<><button className="voltar" onClick={()=>setProtocolo(null)}>Voltar aos pedidos</button><DetalhePrivacidade route={{params:{protocolo}}}/></>:<Privacidade navigation={{navigate:(_rota,params)=>setProtocolo(params.protocolo)}}/>}</div>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
