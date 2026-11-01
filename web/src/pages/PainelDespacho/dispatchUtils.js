import moment from "moment";

export const TIPOS = ["LIMPEZA", "INSTALACAO", "REMOCAO", "PREVENTIVA", "PROBLEMA_TECNICO"];

export const FORM_VAZIO = {
  cliente_id: "", aparelho_id: "", tecnico_id: "", tipo_servico: "",
  descricao_problema: "", data: "", hora: "", duracao_prevista_minutos: 120,
};

export const DETALHE_VAZIO = { os: null, data: "", hora: "", tecnico_id: "", duracao: 120 };

export const CORES_STATUS = {
  ABERTA: "#087ea4", EM_ANDAMENTO: "#e69024",
  FINALIZADA: "#159a72", CANCELADA: "#d9534f",
};

export const hoje = () => moment().format("YYYY-MM-DD");

export const dataParaBR = (valor) => valor && moment(valor, "YYYY-MM-DD", true).isValid()
  ? moment(valor, "YYYY-MM-DD").format("DD/MM/YYYY") : "";

export const dataParaISO = (valor) => {
  const data = moment(valor, "DD/MM/YYYY", true);
  return data.isValid() ? data.format("YYYY-MM-DD") : "";
};

export const rotulo = (valor) => String(valor || "")
  .replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, letra => letra.toUpperCase());

export function mensagemErro(error, padrao) {
  const dados = error.response?.data;
  const detalhes = dados?.detalhes?.map(item => `${item.campo}: ${item.mensagem}`).join(" · ");
  return detalhes ? `${dados.erro} ${detalhes}` : dados?.erro || padrao;
}

export function criarEventos(ordens, status, busca) {
  const termo = busca.toLowerCase();
  return ordens
    .filter(ordem => ordem.agendado_para)
    .filter(ordem => status === "TODAS"
      || (status === "ATIVAS" ? !["FINALIZADA", "CANCELADA"].includes(ordem.status) : ordem.status === status))
    .filter(ordem => `${ordem.id} ${ordem.cliente_nome} ${ordem.tecnico_nome} ${ordem.tipo_servico}`.toLowerCase().includes(termo))
    .map(ordem => ({
      id: ordem.id,
      title: `${ordem.numero || `#${ordem.id}`} · ${ordem.cliente_nome} · ${rotulo(ordem.tipo_servico)}`,
      start: new Date(ordem.agendado_para),
      end: moment(ordem.agendado_para).add(Number(ordem.duracao_prevista_minutos || 120), "minutes").toDate(),
      resourceId: ordem.tecnico_id,
      status: ordem.status,
      os: ordem,
    }));
}
