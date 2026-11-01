import React, { useMemo, useState } from "react";
import { api } from "../../services/api";

const PADRAO = {
  PREVENTIVA: ["Filtros verificados", "Serpentinas verificadas", "Dreno verificado", "Conexões elétricas verificadas", "Operação testada"],
  LIMPEZA: ["Filtros higienizados", "Serpentina limpa", "Condensadora limpa", "Dreno desobstruído", "Funcionamento testado"],
  INSTALACAO: ["Suportes fixados", "Tubulação isolada", "Dreno testado", "Vácuo realizado", "Funcionamento testado"],
  REMOCAO: ["Gás recolhido", "Rede elétrica isolada", "Tubulação vedada", "Local limpo"],
  PROBLEMA_TECNICO: ["Defeito reproduzido", "Componentes testados", "Causa identificada", "Reparo testado", "Cliente orientado"],
};

const obterGps = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) { reject(new Error("Localização indisponível.")); return; }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
    () => reject(new Error("Autorize a localização do navegador.")),
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

export default function OsWorkPanel({ os, recarregar, erro, fechar }) {
  const itens = useMemo(() => {
    const modelo = os.checklist_modelo?.map(item => item.item);
    return modelo?.length ? modelo : PADRAO[os.tipo_servico] || PADRAO.PREVENTIVA;
  }, [os]);
  const existentes = Object.fromEntries((os.checklist || []).map(item => [item.item, item]));
  const [form, setForm] = useState({ diagnostico: os.diagnostico || "", solucao_aplicada: os.solucao_aplicada || "", recomendacoes: os.recomendacoes || "", garantia_dias: os.garantia_dias || 0, retorno_necessario: Boolean(os.retorno_necessario) });
  const [checks, setChecks] = useState(Object.fromEntries(itens.map(item => [item, existentes[item] || { item, conforme: true, observacao: "" }])));
  const [busy, setBusy] = useState("");
  const executar = async (acao, operacao) => { setBusy(acao); erro(""); try { await operacao(); await recarregar(); } catch (e) { erro(e.response?.data?.erro || e.message); } finally { setBusy(""); } };
  const evento = tipo => executar(tipo, async () => api.post(`/os/${os.id}/eventos`, { evento: tipo, ...await obterGps() }));
  const upload = (arquivo, tipo) => executar(tipo, async () => {
    if (!arquivo) throw new Error("Selecione uma imagem.");
    const dados = new FormData(); dados.append("imagem", arquivo); dados.append("os_id", os.id); dados.append("tipo", tipo); dados.append("capturada_em", new Date().toISOString()); dados.append("client_uuid", crypto.randomUUID());
    await api.post("/os/fotos", dados);
  });
  const salvar = () => executar("RELATORIO", () => api.patch(`/os/${os.id}/execucao`, {
    ...form, garantia_dias: Number(form.garantia_dias), checklist: Object.values(checks),
    medicoes: { temperatura_retorno: "", temperatura_insuflamento: "", tensao: "", corrente: "", pressao_baixa: "", pressao_alta: "", umidade: "", superaquecimento: "", subresfriamento: "", tipo_gas: "" },
    itens: (os.itens || []).map(({ estoque_disponivel, ...item }) => item),
  }));
  const finalizar = () => executar("FINALIZAR", async () => { await api.patch(`/os/${os.id}/status`, { novo_status: "FINALIZADA" }); fechar(); });
  const cancelar = () => {
    const motivo = window.prompt("Informe o motivo do encerramento sem atendimento:", "Cliente desistiu do suporte");
    if (motivo === null) return;
    if (motivo.trim().length < 5) { erro("Informe um motivo com pelo menos 5 caracteres."); return; }
    executar("CANCELAR", async () => { await api.patch(`/os/${os.id}/status`, { novo_status: "CANCELADA", motivo_cancelamento: motivo.trim() }); fechar(); });
  };
  if (["FINALIZADA", "CANCELADA"].includes(os.status)) return null;
  if (os.status === "ABERTA") return <section className="web-execution"><h3>Execução da O.S.</h3><button className="primary wide" disabled={!!busy} onClick={() => evento("CHECKIN")}>{busy ? "Obtendo GPS..." : "Iniciar e fazer check-in"}</button><button className="wide cancel-os" disabled={!!busy} onClick={cancelar}>{busy === "CANCELAR" ? "Encerrando..." : "Cliente desistiu — encerrar O.S."}</button></section>;
  return <section className="web-execution"><h3>Execução da O.S.</h3>
    <div className="execution-uploads">{[["ANTES", "Foto antes"], ["DEPOIS", "Foto depois"], ["EVIDENCIA", "Evidência"], ["ASSINATURA", "Assinatura"]].map(([tipo, rotulo]) => <label key={tipo}><input type="file" accept="image/jpeg,image/png" capture="environment" disabled={!!busy} onChange={e => { upload(e.target.files?.[0], tipo); e.target.value = ""; }} /><span>{busy === tipo ? "Enviando..." : rotulo}</span></label>)}</div>
    {[["diagnostico", "Diagnóstico *"], ["solucao_aplicada", "Solução aplicada *"], ["recomendacoes", "Recomendações"]].map(([campo, rotulo]) => <label key={campo}>{rotulo}<textarea value={form[campo]} onChange={e => setForm({ ...form, [campo]: e.target.value })} /></label>)}
    <label>Garantia (dias)<input type="number" min="0" value={form.garantia_dias} onChange={e => setForm({ ...form, garantia_dias: e.target.value })} /></label>
    <label className="execution-return"><input type="checkbox" checked={form.retorno_necessario} onChange={e => setForm({ ...form, retorno_necessario: e.target.checked })} /> Retorno necessário</label>
    <h4>Checklist</h4>{itens.map(item => <div className="execution-check" key={item}><b>{item}</b><select value={String(checks[item].conforme)} onChange={e => setChecks({ ...checks, [item]: { ...checks[item], conforme: e.target.value === "true" } })}><option value="true">Conforme</option><option value="false">Não conforme</option></select>{!checks[item].conforme && <input placeholder="Observação obrigatória" value={checks[item].observacao} onChange={e => setChecks({ ...checks, [item]: { ...checks[item], observacao: e.target.value } })} />}</div>)}
    <button className="primary wide" disabled={!!busy} onClick={salvar}>{busy === "RELATORIO" ? "Salvando..." : "Salvar relatório e checklist"}</button>
    {!os.checkout_em && <button className="wide work-secondary" disabled={!!busy} onClick={() => evento("CHECKOUT")}>Fazer check-out com GPS</button>}
    <button className="wide finish-os" disabled={!!busy} onClick={finalizar}>{busy === "FINALIZAR" ? "Finalizando..." : "Finalizar O.S. e gerar PDF"}</button>
    <button className="wide cancel-os" disabled={!!busy} onClick={cancelar}>{busy === "CANCELAR" ? "Encerrando..." : "Cliente desistiu — encerrar sem atendimento"}</button>
  </section>;
}
