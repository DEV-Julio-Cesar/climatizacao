import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/pt-br";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "../../dispatch.css";
import { api } from "../../services/api";

moment.locale("pt-br");
const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

const TIPOS = [
  "LIMPEZA",
  "INSTALACAO",
  "REMOCAO",
  "PREVENTIVA",
  "PROBLEMA_TECNICO",
];

const vazio = {
  cliente_id: "",
  aparelho_id: "",
  tecnico_id: "",
  tipo_servico: "",
  descricao_problema: "",
  data: "",
  hora: "",
  duracao_prevista_minutos: 120,
};

const cores = {
  ABERTA: "#087ea4",
  EM_ANDAMENTO: "#e69024",
  FINALIZADA: "#159a72",
  CANCELADA: "#d9534f",
};

const hoje = () => moment().format("YYYY-MM-DD");

// Estado inicial do drawer de detalhe/reagendamento
const detalheVazio = {
  os: null,
  data: "",
  hora: "",
  tecnico_id: "",
  duracao: 120,
};

export default function PainelDespacho() {
  const [ordens, setOrdens] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [modal, setModal] = useState(false);
  // detalhe substitui "selecionada" — carrega os valores atuais da OS
  // para que os inputs sejam completamente controlados pelo React
  const [detalhe, setDetalhe] = useState(detalheVazio);
  const [form, setForm] = useState(vazio);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("ATIVAS");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

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

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const [t, o, c] = await Promise.all([
        api.get("/tecnicos"),
        api.get("/os/todas"),
        api.get("/clientes"),
      ]);
      setTecnicos(t.data);
      setOrdens(o.data);
      setClientes(c.data);
    } catch (e) {
      setErro(e.response?.data?.erro || "Não foi possível carregar a agenda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const eventos = useMemo(
    () =>
      ordens
        .filter((o) => o.agendado_para)
        .filter(
          (o) =>
            status === "TODAS" ||
            (status === "ATIVAS"
              ? !["FINALIZADA", "CANCELADA"].includes(o.status)
              : o.status === status),
        )
        .filter((o) =>
          `${o.id} ${o.cliente_nome} ${o.tecnico_nome} ${o.tipo_servico}`
            .toLowerCase()
            .includes(busca.toLowerCase()),
        )
        .map((o) => ({
          id: o.id,
          title: `#${o.id} · ${o.cliente_nome} · ${rotulo(o.tipo_servico)}`,
          start: new Date(o.agendado_para),
          end: moment(o.agendado_para)
            .add(Number(o.duracao_prevista_minutos || 120), "minutes")
            .toDate(),
          resourceId: o.tecnico_id,
          status: o.status,
          os: o,
        })),
    [ordens, status, busca],
  );

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

  const mensagemErro = (e, padrao) => {
    const dados = e.response?.data;
    const detalhes = dados?.detalhes
      ?.map((d) => `${d.campo}: ${d.mensagem}`)
      .join(" · ");
    return detalhes ? `${dados.erro} ${detalhes}` : dados?.erro || padrao;
  };

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
  const abrirDetalhe = (evento) => {
    const os = evento.os;
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
        <button className="primary" onClick={() => { setForm(vazio); setModal(true); }}>
          + Novo agendamento
        </button>
      </section>

      {erro && (
        <div className="alert">
          {erro}
          <button onClick={() => setErro("")}>×</button>
        </div>
      )}

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
      <section className="calendar-panel">
        <DnDCalendar
          localizer={localizer}
          culture="pt-BR"
          events={eventos}
          resources={tecnicos}
          resourceIdAccessor="id"
          resourceTitleAccessor="nome"
          startAccessor="start"
          endAccessor="end"
          defaultView="week"
          views={["day", "week", "month", "agenda"]}
          step={30}
          timeslots={2}
          selectable
          onSelectSlot={abrirHorario}
          onSelectEvent={abrirDetalhe}
          onEventDrop={reagendar}
          draggableAccessor={(e) => !["FINALIZADA", "CANCELADA"].includes(e.status)}
          resizable={false}
          min={new Date(1970, 0, 1, 7)}
          max={new Date(1970, 0, 1, 20)}
          eventPropGetter={(e) => ({
            style: { backgroundColor: cores[e.status], border: 0, borderRadius: 7 },
          })}
          messages={{
            today: "Hoje", previous: "Anterior", next: "Próximo",
            month: "Mês", week: "Semana", day: "Dia", agenda: "Lista",
            date: "Data", time: "Horário", event: "Atendimento",
            noEventsInRange: "Nenhum atendimento neste período.",
            showMore: (n) => `+ ${n} atendimento(s)`,
          }}
        />
      </section>

      {/* ── Modal de criação ─────────────────────────────────────────────── */}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <form className="schedule-modal" onSubmit={criar}>
            <div className="modal-title">
              <div>
                <h2>Novo agendamento</h2>
                <p>A O.S. aparecerá imediatamente na agenda do técnico.</p>
              </div>
              <button type="button" onClick={() => setModal(false)}>×</button>
            </div>

            <label>Cliente *</label>
            <select value={form.cliente_id} onChange={(e) => atualizarForm("cliente_id", e.target.value)}>
              <option value="">Selecione...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>

            <div className="form-grid">
              <div>
                <label>Equipamento</label>
                <select
                  value={form.aparelho_id}
                  onChange={(e) => atualizarForm("aparelho_id", e.target.value)}
                  disabled={!cliente}
                >
                  <option value="">Não vincular</option>
                  {aparelhos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {[a.marca, a.modelo, a.capacidade, a.ambiente].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Técnico *</label>
                <select value={form.tecnico_id} onChange={(e) => atualizarForm("tecnico_id", e.target.value)}>
                  <option value="">Selecione...</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Data *</label>
                <input
                  type="date"
                  min={hoje()}
                  value={form.data}
                  onChange={(e) => atualizarForm("data", e.target.value)}
                />
              </div>
              <div>
                <label>Horário *</label>
                <input
                  type="time"
                  value={form.hora}
                  onChange={(e) => atualizarForm("hora", e.target.value)}
                />
              </div>
              <div>
                <label>Duração prevista *</label>
                <select
                  value={form.duracao_prevista_minutos}
                  onChange={(e) => atualizarForm("duracao_prevista_minutos", e.target.value)}
                >
                  <option value="60">1 hora</option>
                  <option value="90">1h30</option>
                  <option value="120">2 horas</option>
                  <option value="180">3 horas</option>
                  <option value="240">4 horas</option>
                </select>
              </div>
            </div>

            <label>Tipo de serviço *</label>
            <select value={form.tipo_servico} onChange={(e) => atualizarForm("tipo_servico", e.target.value)}>
              <option value="">Selecione...</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{rotulo(t)}</option>
              ))}
            </select>

            <label>Descrição do chamado *</label>
            <textarea
              value={form.descricao_problema}
              onChange={(e) => atualizarForm("descricao_problema", e.target.value)}
              placeholder="Descreva o problema informado pelo cliente..."
              maxLength={1000}
            />

            <div className="modal-actions">
              <button type="button" onClick={() => setModal(false)}>Cancelar</button>
              <button className="primary" disabled={salvando}>
                {salvando ? "Salvando..." : "Criar e agendar O.S."}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Drawer de detalhe / reagendamento ────────────────────────────── */}
      {detalhe.os && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setDetalhe(detalheVazio)}
        >
          <section className="detail-drawer">
            <div className="modal-title">
              <div>
                <span
                  className="status-pill"
                  style={{ background: cores[detalhe.os.status] }}
                >
                  {rotulo(detalhe.os.status)}
                </span>
                <h2>O.S. #{detalhe.os.id}</h2>
              </div>
              <button onClick={() => setDetalhe(detalheVazio)}>×</button>
            </div>

            <h3>{detalhe.os.cliente_nome}</h3>
            <p>{detalhe.os.descricao_problema}</p>

            <div className="detail-list">
              <b>Técnico</b>
              <span>{detalhe.os.tecnico_nome}</span>
              <b>Serviço</b>
              <span>{rotulo(detalhe.os.tipo_servico)}</span>
              <b>Agendamento</b>
              <span>
                {detalhe.os.agendado_para
                  ? new Date(detalhe.os.agendado_para).toLocaleString("pt-BR")
                  : "Não agendado"}
              </span>
              <b>Duração prevista</b>
              <span>{Number(detalhe.os.duracao_prevista_minutos || 120) / 60} hora(s)</span>
            </div>

            {/* Formulário de reagendamento — inputs 100% controlados pelo React */}
            {!["FINALIZADA", "CANCELADA"].includes(detalhe.os.status) && (
              <>
                <h3>Alterar visita</h3>

                <select
                  value={detalhe.tecnico_id}
                  onChange={(e) =>
                    setDetalhe((d) => ({ ...d, tecnico_id: e.target.value }))
                  }
                >
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>

                <select
                  value={detalhe.duracao}
                  onChange={(e) =>
                    setDetalhe((d) => ({ ...d, duracao: e.target.value }))
                  }
                >
                  <option value="60">1 hora</option>
                  <option value="90">1h30</option>
                  <option value="120">2 horas</option>
                  <option value="180">3 horas</option>
                  <option value="240">4 horas</option>
                </select>

                <div className="form-grid">
                  <input
                    type="date"
                    min={hoje()}
                    value={detalhe.data}
                    onChange={(e) =>
                      setDetalhe((d) => ({ ...d, data: e.target.value }))
                    }
                  />
                  <input
                    type="time"
                    value={detalhe.hora}
                    onChange={(e) =>
                      setDetalhe((d) => ({ ...d, hora: e.target.value }))
                    }
                  />
                </div>

                <button className="primary wide" onClick={salvarAgendamento}>
                  Salvar alteração
                </button>
              </>
            )}

            <div className="support-actions">
              <a href={`tel:${detalhe.os.cliente_telefone || ""}`}>
                Ligar para cliente
              </a>
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${String(detalhe.os.cliente_telefone || "").replace(/\D/g, "")}`}
              >
                Abrir WhatsApp
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const Summary = ({ label, value }) => (
  <div>
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
);

const rotulo = (v) =>
  String(v || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (l) => l.toUpperCase());
