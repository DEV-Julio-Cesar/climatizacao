import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { useSession } from '../context/SessionContext';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import WhatsAppAutomacao from '../components/WhatsAppAutomacao';
import '../whatsapp.css';
import '../whatsapp-tabs.css';
const FILAS=[['ATENDENDO','Atendendo'],['ESPERA','Espera'],['AUTOMACAO','Automação']];
const SERVICOS={LIMPEZA:'Limpeza / manutenção',INSTALACAO:'Instalação / remoção',REPARO:'Equipamento com problema',ORCAMENTO:'Orçamento',OUTRO:'Financeiro / outro assunto'};
const ETAPAS={INICIO:'Aguardando contato',AGUARDANDO_SERVICO:'Identificando serviço',AGUARDANDO_NOME:'Perguntando o nome',AGUARDANDO_LOCALIDADE:'Perguntando cidade e bairro',AGUARDANDO_DESCRICAO:'Coletando o pedido',AGUARDANDO_ATENDENTE:'Aguardando equipe'};
const hora=data=>data?new Date(data).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
const nome=item=>item?.triagem?.nome||item?.cliente_nome||item?.nome_contato||item?.telefone||'Contato';
export default function WhatsApp(){
  const {usuario,pode}=useSession(),responder=pode('ATENDIMENTO_RESPONDER');
  const [conversas,setConversas]=useState([]),[selecionada,setSelecionada]=useState(null),[mensagens,setMensagens]=useState([]),[fila,setFila]=useState('ATENDENDO'),[busca,setBusca]=useState('');
  const [rascunhos,setRascunhos]=useState({}),[erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false),[carregando,setCarregando]=useState(false),[configurar,setConfigurar]=useState(false),[agora,setAgora]=useState(Date.now());
  const atual=useRef(null),geracao=useRef(0),fim=useRef(null),listaGeracao=useRef(0);
  const limpar=()=>{atual.current=null;geracao.current++;setSelecionada(null);setMensagens([]);setCarregando(false);};
  const carregar=useCallback(async()=>{const numero=++listaGeracao.current;try{const {data}=await api.get('/atendimento/whatsapp/conversas');if(numero===listaGeracao.current)setConversas(data);}catch(e){if(numero===listaGeracao.current)setErro(e.response?.data?.erro||'Falha ao carregar conversas.');}},[]);
  const abrir=useCallback(async(item,silencioso=false)=>{
    if(silencioso&&atual.current!==item.id)return;
    const numero=++geracao.current;atual.current=item.id;
    if(!silencioso){setSelecionada(item);setMensagens([]);setCarregando(true);setErro('');setAviso('');}
    try{const {data}=await api.get(`/atendimento/whatsapp/conversas/${item.id}`);if(numero===geracao.current&&atual.current===item.id){if(data.conversa.encerrado_em){atual.current=null;setSelecionada(null);setMensagens([]);}else{setSelecionada(data.conversa);setMensagens(data.mensagens);}if(!silencioso)void carregar();}}
    catch(e){if(numero===geracao.current){setErro(e.response?.data?.erro||'Falha ao abrir conversa.');if(!silencioso){atual.current=null;setSelecionada(null);}}}
    finally{if(numero===geracao.current)setCarregando(false);}
  },[carregar]);
  useEffect(()=>{void carregar();const timer=setInterval(()=>setAgora(Date.now()),30000);return()=>{clearInterval(timer);geracao.current++;listaGeracao.current++;};},[carregar]);
  useRealtimeRefresh('whatsapp',async()=>{await carregar();if(atual.current)await abrir({id:atual.current},true);});
  useEffect(()=>{fim.current?.scrollIntoView({behavior:'smooth',block:'end'});},[mensagens]);
  const contagem=useMemo(()=>conversas.reduce((a,c)=>({...a,[c.fila_status]:(a[c.fila_status]||0)+1}),{}),[conversas]);
  const filtradas=conversas.filter(c=>c.fila_status===fila&&`${nome(c)} ${c.telefone} ${SERVICOS[c.triagem?.servico]||''}`.toLowerCase().includes(busca.toLowerCase()));
  const id=selecionada?.id,texto=rascunhos[id]||'',emAtendimento=selecionada?.fila_status==='ATENDENDO'&&selecionada?.atendente_id===usuario?.id;
  const janela=selecionada?.janela_atendimento_ate&&new Date(selecionada.janela_atendimento_ate).getTime()>agora;
  const editar=valor=>setRascunhos(r=>({...r,[id]:valor}));
  async function acao(tipo,body){
    if(!id||ocupado)return;
    if(tipo==='encerrar'&&!window.confirm('Encerrar este atendimento? Uma nova mensagem do cliente reiniciará a recepção. Nenhuma despedida será enviada automaticamente.'))return;
    if(tipo==='fila'&&body.status==='AUTOMACAO'&&!window.confirm('Reiniciar a triagem? O robô retomará a recepção na próxima mensagem do cliente.'))return;
    setOcupado(true);setErro('');
    try{const caminho=`/atendimento/whatsapp/conversas/${id}/${tipo}`;const {data}=tipo==='fila'?await api.patch(caminho,body):await api.post(caminho,body||{});
      if(tipo==='mensagens')setRascunhos(r=>r[id]?.trim()===body.texto?{...r,[id]:''}:r);
      if(atual.current===id){if(tipo==='encerrar'){limpar();setAviso('Atendimento encerrado.');setRascunhos(r=>({...r,[id]:''}));}else{if(tipo==='assumir'){setFila('ATENDENDO');setRascunhos(r=>({...r,[id]:r[id]||`Olá! Meu nome é ${data.atendente_nome||usuario.nome} e vou continuar seu atendimento.`}));}if(tipo==='fila')setFila(data.fila_status);await abrir({id},true);}}await carregar();
    }catch(e){if(atual.current===id)setErro(e.response?.data?.erro||'Não foi possível concluir. Confira o histórico antes de tentar novamente.');}finally{setOcupado(false);}
  }
  if(configurar)return <WhatsAppAutomacao aoFechar={()=>{setConfigurar(false);void carregar();}}/>;
  return <section className="wa-page"><div className="wa-list" role="region" aria-label="Conversas"><div className="wa-list-head"><div><h2>WhatsApp</h2><p>Central de atendimento</p></div><button onClick={carregar} aria-label="Atualizar conversas">↻</button></div>
    {responder&&pode('GESTAO_GERENCIAR')&&<button className="wa-config-button" onClick={()=>{limpar();setConfigurar(true);}}>Configurar automação</button>}
    <div className="wa-tabs">{FILAS.map(([chave,label])=><button key={chave} className={fila===chave?'active':''} onClick={()=>{setFila(chave);limpar();}}>{label}<b>{contagem[chave]||0}</b></button>)}</div><input aria-label="Buscar contato ou serviço" placeholder="Buscar contato ou serviço..." value={busca} onChange={e=>setBusca(e.target.value)}/>
    <div className="wa-conversations">{filtradas.map(c=><button key={c.id} className={id===c.id?'active':''} onClick={()=>abrir(c)}><span className="wa-avatar">{nome(c).slice(0,1).toUpperCase()}</span><span className="wa-preview"><b>{nome(c)}</b><small>{SERVICOS[c.triagem?.servico]||c.ultima_mensagem||'Nova conversa'}</small></span><span className="wa-side"><small>{hora(c.ultima_mensagem_em)}</small>{c.nao_lidas>0&&<i>{c.nao_lidas}</i>}</span></button>)}</div>{!filtradas.length&&<p className="wa-empty">Nenhuma conversa nesta fila.</p>}</div>
    <div className="wa-chat">{erro&&<p className="alert" role="alert">{erro}</p>}{selecionada?<><header><div><b>{nome(selecionada)}</b><small>+{selecionada.telefone}</small></div><span className={`wa-window ${janela?'open':''}`}>{janela?'Janela aberta':'Janela encerrada'}</span>{responder&&!carregando&&(selecionada.fila_status!=='ATENDENDO'?<button className="wa-claim" disabled={ocupado} onClick={()=>acao('assumir')}>Assumir atendimento</button>:emAtendimento&&<button className="wa-close-service" disabled={ocupado} onClick={()=>acao('encerrar')}>Encerrar atendimento</button>)}</header>
    {carregando?<p role="status">Carregando conversa...</p>:<><details className="wa-triage" open><summary>Resumo da recepção · {ETAPAS[selecionada.bot_etapa]||selecionada.fila_status}</summary><div><b>{SERVICOS[selecionada.triagem?.servico]||'Serviço ainda não informado'}</b>{selecionada.triagem?.localidade&&<span>{selecionada.triagem.localidade}</span>}{selecionada.triagem?.descricao&&<p>{selecionada.triagem.descricao}</p>}</div></details>
    {conversas.find(c=>c.id===id)?.bot_ultimo_erro==='ENVIO_NAO_CONFIRMADO'&&<p className="alert">A resposta automática não teve confirmação de envio. Confira a conversa e assuma o atendimento.</p>}
    <div className="wa-messages" aria-label="Histórico da conversa">{mensagens.length>=500&&<p>Exibindo as 500 mensagens mais recentes.</p>}{mensagens.map(m=><div key={m.id} className={`wa-message ${m.direcao==='SAIDA'?'out':'in'}`}><p>{m.conteudo}</p><small>{hora(m.ocorrida_em)}{m.direcao==='SAIDA'?` · ${m.status}`:''}</small></div>)}<div ref={fim} className="wa-scroll-anchor"/></div>
    {responder&&<div className="wa-actions">{emAtendimento&&janela&&<><button disabled={ocupado} onClick={()=>editar('Para avançarmos, poderia confirmar a quantidade e o modelo dos aparelhos?')}>Pedir detalhes</button><button disabled={ocupado} onClick={()=>editar('Agradecemos o contato! Se precisar novamente, é só enviar uma mensagem.')}>Preparar despedida</button></>}{selecionada.fila_status!=='ESPERA'&&<button disabled={ocupado} onClick={()=>acao('fila',{status:'ESPERA'})}>Enviar para espera</button>}{selecionada.fila_status!=='AUTOMACAO'&&<button disabled={ocupado} onClick={()=>acao('fila',{status:'AUTOMACAO'})}>Retomar automação</button>}</div>}
    <form className="wa-compose" onSubmit={e=>{e.preventDefault();if(responder&&emAtendimento&&janela&&texto.trim())void acao('mensagens',{texto:texto.trim()});}}><textarea aria-label="Mensagem para o cliente" maxLength={4000} value={texto} onChange={e=>editar(e.target.value)} disabled={!responder||!emAtendimento||!janela||ocupado} placeholder={!responder?'Seu acesso permite apenas visualizar.':!emAtendimento?'Assuma o atendimento para responder.':!janela?'Aguarde uma nova mensagem do cliente para reabrir a janela.':'Digite uma mensagem...'}/><button className="primary" disabled={!responder||!emAtendimento||!janela||ocupado||!texto.trim()}>{ocupado?'Aguarde...':'Enviar'}</button></form></>}
    </>:<div className="wa-placeholder"><h2>Atendimento pelo WhatsApp</h2><p>Selecione uma conversa para acompanhar o pedido do cliente.</p>{aviso&&<p role="status" className="wa-success">{aviso}</p>}</div>}</div></section>;
}
