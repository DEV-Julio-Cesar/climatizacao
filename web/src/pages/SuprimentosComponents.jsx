import React from "react";

export function Table({ headers, rows }) {
  if (!rows.length) return <div className="empty">Nenhum registro encontrado.</div>;
  return <div className="table-scroll supply-table"><table><thead><tr>{headers.map(item => <th key={item}>{item}</th>)}</tr></thead>
    <tbody>{rows.map((linha, indice) => <tr key={indice}>{linha.map((celula, coluna) => <td key={coluna}>{celula}</td>)}</tr>)}</tbody></table></div>;
}
export function Kpi({ label, value, warning }) { return <div className={warning ? "warning" : ""}><small>{label}</small><b>{value}</b></div>; }
export function Modal({ title, close, children, wide }) {
  return <div className="modal-backdrop" onMouseDown={evento => evento.target === evento.currentTarget && close()}><section className={`form-modal ${wide ? "client-form-modal" : ""}`}><div className="modal-title"><h2>{title}</h2><button onClick={close}>×</button></div>{children}</section></div>;
}
export function Field({ label, name, form, set, type="text", ...rest }) {
  return <div><label>{label}</label><input {...rest} type={type} value={form[name] ?? ""} onChange={evento => set({ ...form, [name]:evento.target.value })} /></div>;
}
export function Actions({ close, saving }) { return <div className="modal-actions"><button type="button" onClick={close}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div>; }
