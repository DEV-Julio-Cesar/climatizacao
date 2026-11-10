import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
const inicial=()=>({etapa:'INICIO',dados:{},tentativas:0});
export default function WhatsAppAutomacao({aoFechar}){
  const [config,setConfig]=useState(null),[erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[estado,setEstado]=useState(inicial),[historico,setHistorico]=useState([]),[texto,setTexto]=useState(''),[ocupado,setOcupado]=useState(false);
  useEffect(()=>{let ativo=true;api.get('/atendimento/whatsapp/automacao').then(({data})=>{if(ativo)setConfig(data);}).catch(()=>{if(ativo)setErro('Não foi possível carregar. Feche e tente novamente.');});return()=>{ativo=false;};},[]);
  const reiniciar=()=>{setEstado(inicial());setHistorico([]);setTexto('');};
  const alterar=(chave,valor)=>{setConfig(c=>({...c,[chave]:valor}));setAviso('');reiniciar();};
  async function salvar(e){e.preventDefault();setOcupado(true);setErro('');setAviso('');try{await api.put('/atendimento/whatsapp/automacao',config);setAviso('Configuração salva. Desativar encaminha as conversas do robô para a espera.');}catch(e){setErro(e.response?.data?.erro||'Não foi possível salvar.');}finally{setOcupado(false);}}
  async function simular(e){e.preventDefault();if(!texto.trim()||ocupado)return;setOcupado(true);setErro('');const entrada=texto.trim();try{const {data}=await api.post('/atendimento/whatsapp/automacao/simular',{config,estado,texto:entrada});setHistorico(h=>[...h,{cliente:entrada,resposta:data.texto}]);setEstado({etapa:data.proximaEtapa,dados:data.dados,tentativas:data.tentativas});setTexto('');}catch(e){setErro(e.response?.data?.erro||'Não foi possível simular.');}finally{setOcupado(false);}}
  return <section className="wa-automation" aria-label="Configuração da automação"><div className="wa-settings-head"><div><h2>Recepção automática</h2><p>Personalize a entrada do cliente e teste antes de salvar.</p></div><button onClick={aoFechar} disabled={ocupado}>Voltar às conversas</button></div>
    {erro&&<p role="alert" className="alert">{erro}</p>}{aviso&&<p role="status" className="wa-success">{aviso}</p>}{config?<div className="wa-settings-grid"><form onSubmit={salvar} className="wa-settings-form">
      <label className="wa-check"><input type="checkbox" checked={config.ativo} disabled={ocupado} onChange={e=>alterar('ativo',e.target.checked)}/>Recepção automática ativa</label>
      <label>Nome do atendimento<input required minLength={2} maxLength={150} value={config.nome_atendimento} disabled={ocupado} onChange={e=>alterar('nome_atendimento',e.target.value)}/></label>
      <label>Mensagem de boas-vindas<textarea required minLength={5} maxLength={700} value={config.boas_vindas} disabled={ocupado} onChange={e=>alterar('boas_vindas',e.target.value)}/></label>
      <label>Horário de atendimento (informativo)<input maxLength={300} value={config.horario_informativo} placeholder="Ex.: segunda a sexta, das 8h às 18h" disabled={ocupado} onChange={e=>alterar('horario_informativo',e.target.value)}/></label>
      <label>Mensagem ao encaminhar para a equipe<textarea required minLength={5} maxLength={500} value={config.encaminhamento} disabled={ocupado} onChange={e=>alterar('encaminhamento',e.target.value)}/></label>
      <p>Digite 0 para falar com uma pessoa. O robô coleta o pedido; valores e agendamento são confirmados pela equipe.</p><button className="primary" disabled={ocupado}>{ocupado?'Aguarde...':'Salvar automação'}</button>
    </form><div className="wa-simulator"><h3>Simular atendimento</h3><p>Teste os textos em edição. Esta simulação não envia mensagens ao WhatsApp.</p>
      <div className="wa-simulation-log" aria-label="Conversa simulada" aria-live="polite">{!historico.length&&<p>Digite “Olá” para começar.</p>}{historico.map((item,i)=><React.Fragment key={i}><p className="wa-sim-client"><b>Cliente:</b> {item.cliente}</p>{item.resposta&&<p><b>Recepção:</b> {item.resposta}</p>}</React.Fragment>)}{estado.etapa==='AGUARDANDO_ATENDENTE'&&<p role="status">Encaminhado para a fila de espera.</p>}</div>
      <form onSubmit={simular}><label>Mensagem de teste<input maxLength={4096} value={texto} disabled={ocupado||estado.etapa==='AGUARDANDO_ATENDENTE'} onChange={e=>setTexto(e.target.value)}/></label><button disabled={ocupado||!texto.trim()||estado.etapa==='AGUARDANDO_ATENDENTE'}>Simular mensagem</button><button type="button" onClick={reiniciar} disabled={ocupado}>Reiniciar simulação</button></form>
    </div></div>:!erro&&<p>Carregando configuração...</p>}
  </section>;
}
