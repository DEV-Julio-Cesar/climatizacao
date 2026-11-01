import React, { useState } from "react";

const TIPOS = [
  ["CLIENTE_DESISTIU", "Cliente desistiu do suporte"],
  ["CLIENTE_AUSENTE", "Cliente ausente"],
  ["SEM_PECA", "Atendimento sem peça disponível"],
  ["DUPLICIDADE_ERRO", "Duplicidade ou erro de cadastro"],
  ["ADMINISTRATIVO", "Cancelamento administrativo"],
  ["OUTRO", "Outro motivo"],
];

export default function CancelOrderModal({ salvando, fechar, confirmar }) {
  const [tipo, setTipo] = useState("CLIENTE_DESISTIU");
  const [motivo, setMotivo] = useState("Cliente desistiu do suporte");
  const enviar = evento => {
    evento.preventDefault();
    confirmar({ tipo_cancelamento: tipo, motivo_cancelamento: motivo.trim() });
  };
  return <div className="modal-backdrop cancel-backdrop" onMouseDown={e => e.target === e.currentTarget && !salvando && fechar()}>
    <form className="form-modal cancel-modal" onSubmit={enviar}>
      <div className="modal-title"><div><span className="eyebrow">ENCERRAR SEM ATENDIMENTO</span><h2>Cancelar O.S.</h2><p>O cancelamento ficará registrado no histórico e não será contado como serviço concluído.</p></div><button type="button" disabled={salvando} onClick={fechar}>×</button></div>
      <label>Tipo de cancelamento *</label>
      <select value={tipo} onChange={e => { setTipo(e.target.value); setMotivo(TIPOS.find(item => item[0] === e.target.value)?.[1] || ""); }}>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select>
      <label>Justificativa *</label>
      <textarea autoFocus minLength="5" maxLength="500" required value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descreva o motivo do cancelamento..." />
      <div className="cancel-warning">Esta ação encerra a O.S. sem exigir fotos, assinatura, relatório ou check-out.</div>
      <div className="modal-actions"><button type="button" disabled={salvando} onClick={fechar}>Voltar</button><button className="danger-confirm" disabled={salvando || motivo.trim().length < 5}>{salvando ? "Encerrando..." : "Confirmar cancelamento"}</button></div>
    </form>
  </div>;
}
