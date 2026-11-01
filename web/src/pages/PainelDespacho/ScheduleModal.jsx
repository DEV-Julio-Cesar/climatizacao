import React, { useEffect, useRef, useState } from "react";
import { TIPOS, dataParaBR, dataParaISO, rotulo } from "./dispatchUtils";

export default function ScheduleModal({ form, cliente, aparelhos, clientes, tecnicos, salvando, atualizar, fechar, criar }) {
  return (
    <div className="modal-backdrop" onMouseDown={evento => evento.target === evento.currentTarget && fechar()}>
      <form className="schedule-modal" onSubmit={criar}>
        <div className="modal-title"><div><h2>Novo agendamento</h2><p>A O.S. aparecerá imediatamente na agenda do técnico.</p></div><button type="button" onClick={fechar}>×</button></div>
        <label>Cliente *</label>
        <select value={form.cliente_id} onChange={evento => atualizar("cliente_id", evento.target.value)}><option value="">Selecione...</option>{clientes.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
        <div className="form-grid">
          <div><label>Equipamento</label><select value={form.aparelho_id} onChange={evento => atualizar("aparelho_id", evento.target.value)} disabled={!cliente}><option value="">Não vincular</option>{aparelhos.map(item => <option key={item.id} value={item.id}>{[item.marca, item.modelo, item.capacidade, item.ambiente].filter(Boolean).join(" · ")}</option>)}</select></div>
          <div><label>Técnico *</label><select value={form.tecnico_id} onChange={evento => atualizar("tecnico_id", evento.target.value)}><option value="">Selecione...</option>{tecnicos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
          <div><label>Data *</label><DateInputBR value={form.data} onChange={valor => atualizar("data", valor)} /></div>
          <div><label>Horário *</label><input type="time" value={form.hora} onChange={evento => atualizar("hora", evento.target.value)} /></div>
          <div><label>Duração prevista *</label><DurationSelect value={form.duracao_prevista_minutos} onChange={valor => atualizar("duracao_prevista_minutos", valor)} /></div>
        </div>
        <label>Tipo de serviço *</label>
        <select value={form.tipo_servico} onChange={evento => atualizar("tipo_servico", evento.target.value)}><option value="">Selecione...</option>{TIPOS.map(tipo => <option key={tipo} value={tipo}>{rotulo(tipo)}</option>)}</select>
        <label>Descrição do chamado *</label>
        <textarea value={form.descricao_problema} onChange={evento => atualizar("descricao_problema", evento.target.value)} placeholder="Descreva o problema informado pelo cliente..." maxLength={1000} />
        <div className="modal-actions"><button type="button" onClick={fechar}>Cancelar</button><button className="primary" disabled={salvando}>{salvando ? "Salvando..." : "Criar e agendar O.S."}</button></div>
      </form>
    </div>
  );
}

export function DurationSelect({ value, onChange }) {
  return <select value={value} onChange={evento => onChange(evento.target.value)}><option value="60">1 hora</option><option value="90">1h30</option><option value="120">2 horas</option><option value="180">3 horas</option><option value="240">4 horas</option></select>;
}

export function DateInputBR({ value, onChange }) {
  const [texto, setTexto] = useState(dataParaBR(value));
  const editando = useRef(false);
  useEffect(() => { if (!editando.current) setTexto(dataParaBR(value)); }, [value]);

  const alterar = (evento) => {
    const digitos = evento.target.value.replace(/\D/g, "").slice(0, 8);
    const mascarado = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join("/");
    setTexto(mascarado);
    evento.target.setCustomValidity("");
    if (!digitos) onChange("");
    if (digitos.length === 8) {
      const iso = dataParaISO(mascarado);
      if (iso) onChange(iso);
      else evento.target.setCustomValidity("Informe uma data válida no formato DD/MM/AAAA.");
    }
  };

  const sair = (evento) => {
    editando.current = false;
    const iso = dataParaISO(texto);
    evento.target.setCustomValidity(iso ? "" : "Informe uma data válida no formato DD/MM/AAAA.");
    if (!iso) onChange("");
  };

  return <input type="text" inputMode="numeric" placeholder="DD/MM/AAAA" value={texto} maxLength={10}
    aria-label="Data no formato dia, mês e ano" onFocus={() => { editando.current = true; }}
    onChange={alterar} onBlur={sair} required />;
}
