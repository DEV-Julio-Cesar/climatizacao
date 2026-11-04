import React,{useCallback,useEffect,useState} from 'react';
import { api } from '../services/api';
import { useSession } from '../context/SessionContext';
export default function Central() {
  const {usuario,pode}=useSession();
  const gestor=['GESTOR','ADMIN'].includes(usuario?.perfil)&&pode('GESTAO_VISUALIZAR');
  const [notificacoes,setNotificacoes]=useState([]),[tarefas,setTarefas]=useState([]),[erro,setErro]=useState(''),[loading,setLoading]=useState(false),[ocupado,setOcupado]=useState(null);
  const carregar=useCallback(async()=>{setLoading(true);setErro('');try{const [n,d]=await Promise.all([api.get('/notificacoes'),gestor?api.get('/documentos/tarefas'):Promise.resolve({data:[]})]);setNotificacoes(n.data);setTarefas(d.data);}catch(e){setErro(e.response?.data?.erro||e.message);}finally{setLoading(false);}},[gestor]);
  useEffect(()=>{carregar();},[carregar]);
  const ler=async id=>{try{await api.patch(`/notificacoes/${id}/ler`);await carregar();}catch(e){setErro(e.response?.data?.erro||'Falha ao atualizar.');}};
  const repetir=async id=>{if(!window.confirm('Gerar o documento e tentar o envio novamente? O cliente pode receber outra cópia.'))return;setOcupado(id);try{await api.post(`/documentos/${id}/reprocessar`);await carregar();}catch(e){setErro(e.response?.data?.erro||'Falha ao reprocessar.');}finally{setOcupado(null);}};
  return <><section className="panel"><div className="panel-title"><h2>Notificações</h2><button disabled={loading} onClick={carregar}>Atualizar</button></div>{erro&&<div className="alert" role="alert">{erro}</div>}{notificacoes.map(n=><div className="line" key={n.id}><span><strong>{n.titulo}</strong><small>{n.mensagem}</small></span>{!n.lida&&<button onClick={()=>ler(n.id)}>Marcar como lida</button>}</div>)}{!notificacoes.length&&<p>Nenhuma notificação.</p>}</section>
    {gestor&&<section className="panel"><h2>Geração e envio de documentos</h2><div className="table-scroll"><table><thead><tr><th>O.S.</th><th>Cliente</th><th>Status</th><th>Tentativas</th><th>Ação</th></tr></thead><tbody>{tarefas.map(t=>{const processando=t.bloqueado_ate&&Date.parse(t.bloqueado_ate)>Date.now();return <tr key={t.os_id}><td>#{t.os_id}</td><td>{t.cliente_nome}</td><td>{t.concluido_em?'Concluído':processando?'Processando':t.ultimo_erro?'Reagendado':'Pendente'}</td><td>{t.tentativas}</td><td>{pode('GESTAO_GERENCIAR')&&<button disabled={processando||ocupado===t.os_id} onClick={()=>repetir(t.os_id)}>Reprocessar</button>}</td></tr>;})}</tbody></table></div>{!tarefas.length&&<p>Nenhuma tarefa registrada.</p>}</section>}</>;
}
