import React, { useMemo, useState } from "react";
import moment from "moment";
import "../../dispatch.css";
import { api } from "../../services/api";
import DispatchCalendar from "./DispatchCalendar";
import DetailDrawer from "./DetailDrawer";
import ScheduleModal from "./ScheduleModal";
import { useDispatchData } from "./useDispatchData";
import { DETALHE_VAZIO as detalheVazio, FORM_VAZIO as vazio,
  criarEventos, hoje, mensagemErro } from "./dispatchUtils";

export default function PainelDespacho() {
  const { ordens, setOrdens, tecnicos, clientes, loading, erro, setErro, carregar } = useDispatchData();
  const [modal, setModal] = useState(false);
  // detalhe substitui "selecionada" — carrega os valores atuais da OS
  // para que os inputs sejam completamente controlados pelo React
  const [detalhe, setDetalhe] = useState(detalheVazio);
  const [form, setForm] = useState(vazio);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("ATIVAS");
  const [salvando, setSalvando] = useState(false);
  const [enviandoLembrete, setEnviandoLembrete] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [abrindoWhatsApp, setAbrindoWhatsApp] = useState(false);
  const [sucesso, setSucesso] = useState("");

  const usuario = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("climasaas_usuario") || "{}");
    } catch {
      return {};
    }
  }, []);

  const permissoes = usuario.permissoes || [];
  const podeCriar =
    !Array.isArray(permissoes) ||
    permissoes.includes("*") ||
    permissoes.includes("OS_CRIAR");
  const podeReagendar =
    !Array.isArray(permissoes) ||
    permissoes.includes("*") ||
    permissoes.includes("OS_REAGENDAR");

  const eventos = useMemo(() => criarEventos(ordens, status, busca), [ordens, status, busca]);

  const cliente = clientes.find(
    (c) => String(c.id) === String(form.cliente_id),
  );
  const aparelhos = cliente?.aparelhos || [];

  const atualizarForm = (campo, valor) =>
    setForm((f) => ({
      ...f,
      [campo]: valor,
      ...(campo === "cliente_id" ? { aparelho_id: "" } : {}),
    }));

  // ── Criação de nova OS ──────────────────────────────────────────────────────
  const criar = async (e) => {
    e.preventDefault();
    if (!podeCriar)
      return setErro("Seu usuário não possui permissão para criar agendamentos.");
    if (
      !form.cliente_id ||
      !form.tecnico_id ||
      !form.tipo_servico ||
      form.descricao_problema.trim().length < 5 ||
      !form.data ||
      !form.hora
    )
      return setErro(
        "Preencha cliente, técnico, serviço, descrição, data e horário.",
      );
    if (form.data < hoje())
      return setErro("A data do agendamento não pode ser anterior a hoje.");
    setSalvando(true);
    setErro("");
    try {
      await api.post("/os", {
        cliente_id: Number(form.cliente_id),
        aparelho_id: form.aparelho_id ? Number(form.aparelho_id) : null,
        tecnico_id: Number(form.tecnico_id),
        tipo_servico: form.tipo_servico,
        descricao_problema: form.descricao_problema.trim(),
        agendado_para: new Date(`${form.data}T${form.hora}:00`).toISOString(),
        duracao_prevista_minutos: Number(form.duracao_prevista_minutos),
      });
      setModal(false);
      setForm(vazio);
      await carregar();
    } catch (e2) {
      setErro(mensagemErro(e2, "Falha ao criar agendamento."));
    } finally {
      setSalvando(false);
    }
  };

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const reagendar = async ({ event, start, resourceId }) => {
    if (!podeReagendar)
      return setErro(
        "Seu usuário não possui permissão para reagendar atendimentos.",
      );
    if (["FINALIZADA", "CANCELADA"].includes(event.status)) return;
    const tecnico = Number(resourceId || event.resourceId);
    // Atualização otimista
    setOrdens((lista) =>
      lista.map((o) =>
        o.id === event.id
          ? {
              ...o,
              tecnico_id: tecnico,
              agendado_para: start.toISOString(),
              tecnico_nome:
                tecnicos.find((t) => t.id === tecnico)?.nome || o.tecnico_nome,
            }
          : o,
      ),
    );
    try {
      await api.patch(`/os/${event.id}/reagendar`, {
        tecnico_id: tecnico,
        agendado_para: start.toISOString(),
        duracao_prevista_minutos: Number(
          event.os.duracao_prevista_minutos || 120,
        ),
      });
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível reagendar."));
      await carregar(); // reverte o otimismo
    }
  };

  // ── Salvar alteração de agendamento via drawer ────────────────────────────
  // Totalmente controlado por estado React — sem document.getElementById
  const salvarAgendamento = async () => {
    if (!podeReagendar)
      return setErro(
        "Seu usuário não possui permissão para reagendar atendimentos.",
      );
    const { os, data, hora, tecnico_id, duracao } = detalhe;
    if (!data || !hora || !tecnico_id)
      return setErro("Preencha técnico, data e horário.");
    if (data < hoje())
      return setErro("A data do agendamento não pode ser anterior a hoje.");
    try {
      await api.patch(`/os/${os.id}/reagendar`, {
        tecnico_id: Number(tecnico_id),
        agendado_para: new Date(`${data}T${hora}:00`).toISOString(),
        duracao_prevista_minutos: Number(duracao),
      });
      setDetalhe(detalheVazio);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao alterar agendamento."));
    }
  };

  const enviarLembrete = async (id) => {
    setEnviandoLembrete(true);
    setErro("");
    try {
      const { data } = await api.post(`/os/${id}/lembrete`);
      setSucesso(data.mensagem);
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao enviar lembrete."));
    } finally {
      setEnviandoLembrete(false);
    }
  };

  const enviarFoto = async (arquivo) => {
    if (!arquivo || !detalhe.os) return;
    setEnviandoFoto(true);
    setErro("");
    try {
      const formData = new FormData();
      formData.append("imagem", arquivo);
      formData.append("os_id", String(detalhe.os.id));
      formData.append("tipo", "EVIDENCIA");
      formData.append("capturada_em", new Date().toISOString());
      formData.append("client_uuid", crypto.randomUUID());
      await api.post("/os/fotos", formData);
      const resposta = await api.get(`/os/${detalhe.os.id}`);
      setDetalhe(atual => ({ ...atual, os: resposta.data }));
      setSucesso("Foto adicionada à O.S.");
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao enviar foto."));
    } finally {
      setEnviandoFoto(false);
    }
  };

  const abrirWhatsApp = async (os) => {
    setAbrindoWhatsApp(true); setErro("");
    try {
      const { data } = await api.post("/atendimento/whatsapp/iniciar", { cliente_id:Number(os.cliente_id) });
      sessionStorage.setItem("climasaas_abrir_conversa", String(data.id));
      location.hash = "whatsapp";
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível abrir o atendimento pelo WhatsApp."));
    } finally { setAbrindoWhatsApp(false); }
  };

  // ── Abrir slot vazio no calendário ────────────────────────────────────────
  const abrirHorario = (slot) => {
    if (!podeCriar) return;
    const d = moment(slot.start);
    setForm({
      ...vazio,
      data: d.format("YYYY-MM-DD"),
      hora: d.format("HH:mm"),
      tecnico_id: slot.resourceId || "",
    });
    setModal(true);
  };

  // ── Abrir drawer de detalhe ───────────────────────────────────────────────
  const abrirDetalhe = async (evento) => {
    let os = evento.os;
    try {
      const resposta = await api.get(`/os/${os.id}`);
      os = resposta.data?.os || resposta.data;
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar detalhes da O.S."));
    }
    setDetalhe({
      os,
      data: os.agendado_para
        ? moment(os.agendado_para).format("YYYY-MM-DD")
        : "",
      hora: os.agendado_para
        ? moment(os.agendado_para).format("HH:mm")
        : "",
      tecnico_id: String(os.tecnico_id),
      duracao: os.duracao_prevista_minutos || 120,
    });
  };
  const atualizarOsDetalhada=async()=>{if(!detalhe.os)return;const{data}=await api.get(`/os/${detalhe.os.id}`);setDetalhe(a=>({...a,os:data?.os||data}));await carregar()};

  if (loading)
    return <div className="loading">Carregando central de agendamento...</div>;

  return (
    <div className="dispatch-page">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <section className="dispatch-toolbar">
        <div>
          <h2>Central de agendamento</h2>
          <p>Crie, atribua e acompanhe as visitas que chegam ao aplicativo dos técnicos.</p>
        </div>
        <button className="primary" disabled={!tecnicos.length} onClick={() => { setForm(vazio); setModal(true); }}>
          + Novo agendamento
        </button>
      </section>

      {!tecnicos.length && <div className="alert">Nenhum responsável ativo foi encontrado. Cadastre um técnico em Equipe técnica antes de criar o agendamento.</div>}
      {erro && (
        <div className="alert">
          {erro}
          <button onClick={() => setErro("")}>×</button>
        </div>
      )}
      {sucesso && <div className="toast" role="status">{sucesso}<button aria-label="Fechar aviso" onClick={() => setSucesso("")}>×</button></div>}

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <section className="dispatch-filters">
        <input
          placeholder="Buscar cliente, técnico ou O.S..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ATIVAS">O.S. ativas</option>
          <option value="ABERTA">Abertas</option>
          <option value="EM_ANDAMENTO">Em atendimento</option>
          <option value="FINALIZADA">Finalizadas</option>
          <option value="CANCELADA">Canceladas</option>
          <option value="TODAS">Todas</option>
        </select>
        <button onClick={carregar}>Atualizar</button>
      </section>

      {/* ── Resumo ───────────────────────────────────────────────────────── */}
      <section className="dispatch-summary">
        <Summary label="Abertas" value={ordens.filter((o) => o.status === "ABERTA").length} />
        <Summary label="Em atendimento" value={ordens.filter((o) => o.status === "EM_ANDAMENTO").length} />
        <Summary
          label="Sem agendamento"
          value={ordens.filter((o) => !o.agendado_para && !["FINALIZADA", "CANCELADA"].includes(o.status)).length}
        />
        <Summary label="Técnicos disponíveis" value={tecnicos.length} />
      </section>

      {/* ── Calendário ──────────────────────────────────────────────────── */}
      <DispatchCalendar eventos={eventos} tecnicos={tecnicos} abrirHorario={abrirHorario}
        abrirDetalhe={abrirDetalhe} reagendar={reagendar} />

      {/* ── Modal de criação ─────────────────────────────────────────────── */}
      {modal && <ScheduleModal form={form} cliente={cliente} aparelhos={aparelhos} clientes={clientes}
        tecnicos={tecnicos} salvando={salvando} atualizar={atualizarForm}
        fechar={() => setModal(false)} criar={criar} />}

      {/* ── Drawer de detalhe / reagendamento ────────────────────────────── */}
      {detalhe.os && <DetailDrawer detalhe={detalhe} setDetalhe={setDetalhe} tecnicos={tecnicos}
        fechar={() => setDetalhe(detalheVazio)} salvar={salvarAgendamento}
        lembrar={enviarLembrete} enviandoLembrete={enviandoLembrete}
        enviarFoto={enviarFoto} enviandoFoto={enviandoFoto}
        abrirWhatsApp={abrirWhatsApp} abrindoWhatsApp={abrindoWhatsApp}
        atualizarOs={atualizarOsDetalhada} informarErro={setErro} />}
    </div>
  );
}

const Summary = ({ label, value }) => (
  <div>
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
);
