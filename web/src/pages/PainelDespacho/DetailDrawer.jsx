import React from "react";
import { CORES_STATUS, rotulo } from "./dispatchUtils";
import { DateInputBR, DurationSelect } from "./ScheduleModal";
import OsWorkPanel from "./OsWorkPanel";

export default function DetailDrawer({ detalhe, setDetalhe, tecnicos, fechar, salvar, lembrar, enviandoLembrete, enviarFoto, enviandoFoto, abrirWhatsApp, abrindoWhatsApp, atualizarOs, informarErro }) {
  const os = detalhe.os;
  const atualizar = (campo, valor) => setDetalhe(atual => ({ ...atual, [campo]: valor }));
  return (
    <div className="modal-backdrop" onMouseDown={evento => evento.target === evento.currentTarget && fechar()}>
      <section className="detail-drawer">
        <div className="modal-title"><div><span className="status-pill" style={{ background: CORES_STATUS[os.status] }}>{rotulo(os.status)}</span><h2>{os.numero || `O.S. #${os.id}`}</h2></div><button onClick={fechar}>×</button></div>
        <h3>{os.cliente_nome}</h3><p>{os.descricao_problema}</p>
        <div className="detail-list">
          <b>Técnico</b><span>{os.tecnico_nome}</span><b>Serviço</b><span>{rotulo(os.tipo_servico)}</span>
          <b>Agendamento</b><span>{os.agendado_para ? new Date(os.agendado_para).toLocaleString("pt-BR") : "Não agendado"}</span>
          <b>Duração prevista</b><span>{Number(os.duracao_prevista_minutos || 120) / 60} hora(s)</span>
        </div>
        {!!os.fotos?.length && <section className="dispatch-gallery"><h3>Fotos do atendimento</h3><div>{os.fotos.filter(foto => foto.tipo !== "ASSINATURA").map(foto => <a key={foto.id} href={foto.url} target="_blank" rel="noreferrer"><img src={foto.url} alt={`${rotulo(foto.tipo)} da O.S. ${os.id}`} loading="lazy" /><span>{rotulo(foto.tipo)}</span></a>)}</div></section>}
        {os.status === "EM_ANDAMENTO" && <label className={`photo-upload ${enviandoFoto ? "disabled" : ""}`}><input type="file" accept="image/jpeg,image/png" capture="environment" disabled={enviandoFoto} onChange={evento => { const arquivo = evento.target.files?.[0]; evento.target.value = ""; enviarFoto(arquivo); }} />{enviandoFoto ? "Enviando foto..." : "+ Adicionar foto à O.S."}</label>}
        {!["FINALIZADA", "CANCELADA"].includes(os.status) && <><h3>Alterar visita</h3>
          <select value={detalhe.tecnico_id} onChange={evento => atualizar("tecnico_id", evento.target.value)}>{tecnicos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
          <DurationSelect value={detalhe.duracao} onChange={valor => atualizar("duracao", valor)} />
          <div className="form-grid"><DateInputBR value={detalhe.data} onChange={valor => atualizar("data", valor)} /><input type="time" value={detalhe.hora} onChange={evento => atualizar("hora", evento.target.value)} /></div>
          <button className="primary wide" onClick={salvar}>Salvar alteração</button></>}
        <div className="support-actions"><a href={`tel:${os.cliente_telefone || ""}`}>Ligar para cliente</a><button disabled={abrindoWhatsApp} onClick={() => abrirWhatsApp(os)}>{abrindoWhatsApp ? "Abrindo..." : "Abrir WhatsApp"}</button>{os.agendado_para && !["FINALIZADA", "CANCELADA"].includes(os.status) && <button disabled={enviandoLembrete} onClick={() => lembrar(os.id)}>{enviandoLembrete ? "Enviando..." : "Enviar lembrete"}</button>}</div>
        <OsWorkPanel os={os} recarregar={atualizarOs} erro={informarErro} fechar={fechar}/>
      </section>
    </div>
  );
}
