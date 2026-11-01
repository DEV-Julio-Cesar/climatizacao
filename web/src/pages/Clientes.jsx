import React, { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { digitos, documentoValido, enderecoCompleto, label, mascaraCep, mascaraDocumento,
  mascaraTelefone, money, numOrNull, pick, temCoordenadas } from "./clientesUtils";
import { Actions, Field, LocationPicker, Modal } from "./ClientesComponents";

const clienteVazio = {
  nome: "",
  telefone: "",
  cpf_cnpj: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  latitude: null,
  longitude: null,
  quantidade_aparelhos: 0,
};
const equipamentoVazio = {
  cliente_id: "",
  marca: "",
  modelo: "",
  capacidade: "",
  numero_serie: "",
  patrimonio: "",
  tipo_gas: "",
  ambiente: "",
  instalado_em: "",
  garantia_ate: "",
  proxima_manutencao: "",
  observacoes: "",
};
const podeGerenciar = () => {
  try {
    const p =
      JSON.parse(localStorage.getItem("climasaas_usuario") || "{}")
        .permissoes || [];
    return p.includes("*") || p.includes("CLIENTES_GERENCIAR");
  } catch {
    return false;
  }
};

export default function Clientes() {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState(null),
    [clientForm, setClientForm] = useState(null),
    [equipmentForm, setEquipmentForm] = useState(null),
    [qr, setQr] = useState(null),
    [error, setError] = useState(""),
    [msg, setMsg] = useState(""),
    [buscandoCep, setBuscandoCep] = useState(false),
    [saving, setSaving] = useState(false);
  const manage = podeGerenciar();
  const queryClient = useQueryClient();
  const clientesQuery = useInfiniteQuery({
    queryKey:["clientes"], initialPageParam:null,
    queryFn:async({pageParam}) => (await api.get("/clientes",{params:{limit:50,...(pageParam?{cursor:pageParam}:{})}})).data,
    getNextPageParam:ultima => ultima.next_cursor || undefined,
  });
  const alertasQuery = useQuery({ queryKey:["equipamentos-alertas"], queryFn:async() => (await api.get("/equipamentos-alertas")).data });
  const historicoQuery = useInfiniteQuery({
    queryKey:["cliente-ordens", selected?.id], enabled:Boolean(selected?.id), initialPageParam:null,
    queryFn:async({pageParam}) => (await api.get(`/clientes/${selected.id}/ordens`,{params:{limit:20,...(pageParam?{cursor:pageParam}:{})}})).data,
    getNextPageParam:ultima => ultima.next_cursor || undefined,
  });
  const items = clientesQuery.data?.pages.flatMap(pagina => pagina.items) || [];
  const historico = historicoQuery.data?.pages.flatMap(pagina => pagina.items) || [];
  const alertas = alertasQuery.data || [];
  const queryError = clientesQuery.error?.response?.data?.erro || alertasQuery.error?.response?.data?.erro || "";
  const atualizarListas = async () => queryClient.invalidateQueries({ queryKey:["clientes"] });
  const open = async (id) => {
    try {
      setSelected((await api.get(`/clientes/${id}`)).data);
    } catch (e) {
      setError(e.response?.data?.erro || e.message);
    }
  };
  const abrirQr = async (equipamento) => {
    try { const r=await api.get(`/equipamentos/${equipamento.id}/qrcode`,{responseType:"blob"}); setQr({equipamento,url:URL.createObjectURL(r.data)}); }
    catch(e){setError(e.response?.data?.erro||"Não foi possível gerar o QR Code.")}
  };
  const fecharQr=()=>{if(qr?.url)URL.revokeObjectURL(qr.url);setQr(null)};
  const filtered = useMemo(
    () =>
      items.filter((i) =>
        `${i.nome} ${i.telefone || ""} ${i.cpf_cnpj || ""} ${i.endereco || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [items, search],
  );
  const buscarCep = async () => {
    const cep = digitos(clientForm.cep);
    if (cep.length !== 8)
      return setError("Informe um CEP válido com 8 números.");
    setBuscandoCep(true);
    setError("");
    try {
      const { data } = await api.get(`/enderecos/cep/${cep}`);
      setClientForm((f) => ({ ...f, ...data, cep: mascaraCep(cep) }));
    } catch (e) {
      setError(e.response?.data?.erro || "Não foi possível consultar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  };
  const saveClient = async (e) => {
    e.preventDefault();
    setError("");
    if (clientForm.cpf_cnpj && !documentoValido(clientForm.cpf_cnpj))
      return setError("CPF/CNPJ inválido. Confira os números informados.");
    if (clientForm.telefone && digitos(clientForm.telefone).length < 10)
      return setError("Informe um telefone com DDD.");
    setSaving(true);
    try {
      const payload = {
        ...clienteVazio,
        ...clientForm,
        telefone: digitos(clientForm.telefone),
        cpf_cnpj: digitos(clientForm.cpf_cnpj),
        cep: digitos(clientForm.cep),
        latitude: numOrNull(clientForm.latitude),
        longitude: numOrNull(clientForm.longitude),
        quantidade_aparelhos: Number(clientForm.quantidade_aparelhos || 0),
      };
      clientForm.id
        ? await api.patch(`/clientes/${clientForm.id}`, payload)
        : await api.post("/clientes", payload);
      setClientForm(null);
      setMsg("Cliente e endereço salvos com sucesso.");
      await atualizarListas();
    } catch (x) {
      const d = x.response?.data;
      setError(
        d?.detalhes?.[0]?.message ||
          d?.detalhes?.[0]?.mensagem ||
          d?.erro ||
          "Falha ao salvar cliente.",
      );
    } finally {
      setSaving(false);
    }
  };
  const editClient = async (id) => {
    const d = (await api.get(`/clientes/${id}`)).data;
    setClientForm({
      ...pick(d, clienteVazio),
      quantidade_aparelhos: d.aparelhos?.length || 0,
    });
  };
  const saveEquipment = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...equipamentoVazio,
        ...equipmentForm,
        cliente_id: Number(equipmentForm.cliente_id),
      };
      delete payload.id;
      equipmentForm.id
        ? await api.patch(`/equipamentos/${equipmentForm.id}`, payload)
        : await api.post("/equipamentos", payload);
      setEquipmentForm(null);
      setMsg("Equipamento salvo com sucesso.");
      await atualizarListas();
      if (selected) await open(selected.id);
    } catch (x) {
      setError(x.response?.data?.erro || "Falha ao salvar equipamento.");
    }
  };
  const remove = async (type, id) => {
    if (
      !confirm(
        `Deseja realmente inativar este ${type === "clientes" ? "cliente" : "equipamento"}? O histórico será preservado.`,
      )
    )
      return;
    try {
      await api.delete(`/${type}/${id}`);
      setSelected(null);
      setMsg("Cadastro inativado.");
      await atualizarListas();
    } catch (x) {
      setError(x.response?.data?.erro || x.message);
    }
  };
  if (clientesQuery.isLoading || alertasQuery.isLoading) return <div className="loading">Carregando clientes...</div>;
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Clientes e equipamentos</h2>
            <p>Contato, documento, endereço localizado e parque instalado</p>
          </div>
          <div className="toolbar-actions">
            <input
              className="search"
              placeholder="Nome, telefone, CPF/CNPJ ou endereço..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {manage && (
              <button
                className="primary"
                onClick={() => setClientForm({ ...clienteVazio })}
              >
                + Novo cliente
              </button>
            )}
          </div>
        </div>
        {(error || queryError) && (
          <div className="alert">
            {error || queryError}
            <button onClick={() => { setError(""); clientesQuery.refetch(); alertasQuery.refetch(); }}>Tentar novamente</button>
          </div>
        )}
        {alertas.length > 0 && <div className="equipment-alerts"><div><b>{alertas.length} equipamento(s) precisam de atenção</b><small>Manutenções próximas, atrasadas ou garantias vencendo.</small></div>{alertas.slice(0,3).map(a=><button key={a.id} onClick={()=>open(items.find(c=>c.nome===a.cliente_nome)?.id)}><span>{a.cliente_nome} · {[a.marca,a.modelo,a.ambiente].filter(Boolean).join(" ")}</span><b>{label(a.alerta)}</b></button>)}</div>}
        <div className="cards">
          {filtered.map((c) => (
            <article
              className="client-card clickable"
              key={c.id}
              onClick={() => open(c.id)}
            >
              <div className="avatar">{c.nome[0]}</div>
              <div className="grow">
                <h3>{c.nome}</h3>
                <p>
                  {mascaraTelefone(c.telefone) || "Sem telefone"} ·{" "}
                  {mascaraDocumento(c.cpf_cnpj) || "Sem CPF/CNPJ"}
                </p>
                <p>{enderecoCompleto(c) || "Endereço não informado"}</p>
                <small>{c.aparelhos?.length || 0} ar-condicionado(s)</small>
              </div>
              {manage && (
                <button
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    editClient(c.id);
                  }}
                >
                  Editar
                </button>
              )}
            </article>
          ))}
        </div>
        {!filtered.length && (
          <div className="empty">Nenhum cliente encontrado.</div>
        )}
        {clientesQuery.hasNextPage && <button disabled={clientesQuery.isFetchingNextPage}
          onClick={() => clientesQuery.fetchNextPage()}>
          {clientesQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais clientes"}
        </button>}
      </section>
      {selected && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <section className="detail-drawer wide-drawer">
            <div className="modal-title">
              <div>
                <span className="eyebrow">FICHA DO CLIENTE</span>
                <h2>{selected.nome}</h2>
              </div>
              <button onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="detail-list">
              <b>Telefone</b>
              <span>{mascaraTelefone(selected.telefone) || "-"}</span>
              <b>CPF/CNPJ</b>
              <span>{mascaraDocumento(selected.cpf_cnpj) || "-"}</span>
              <b>Endereço</b>
              <span>{enderecoCompleto(selected) || "-"}</span>
              <b>CEP</b>
              <span>{mascaraCep(selected.cep) || "-"}</span>
            </div>
            {temCoordenadas(selected) && (
              <div className="client-detail-map">
                <MapContainer
                  center={[
                    Number(selected.latitude),
                    Number(selected.longitude),
                  ]}
                  zoom={16}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution="© OpenStreetMap"
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker
                    position={[
                      Number(selected.latitude),
                      Number(selected.longitude),
                    ]}
                  />
                </MapContainer>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                >
                  Abrir rota no Google Maps
                </a>
              </div>
            )}
            <div className="section-heading">
              <h3>Ar-condicionados ({selected.aparelhos.length})</h3>
              {manage && (
                <button
                  className="primary"
                  onClick={() =>
                    setEquipmentForm({
                      ...equipamentoVazio,
                      cliente_id: selected.id,
                    })
                  }
                >
                  + Equipamento
                </button>
              )}
            </div>
            {selected.aparelhos.length ? (
              selected.aparelhos.map((a) => (
                <div className="record" key={a.id}>
                  <div>
                    <b>
                      {[a.marca, a.modelo].filter(Boolean).join(" ") ||
                        a.ambiente ||
                        "Equipamento"}
                    </b>
                    <small>
                      {[a.ambiente, a.capacidade, a.numero_serie]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  {manage && (
                  <div>
                      <button onClick={() => abrirQr(a)}>QR Code</button>
                      <button
                        onClick={() =>
                          setEquipmentForm({
                            ...equipamentoVazio,
                            ...a,
                            cliente_id: selected.id,
                          })
                        }
                      >
                        Editar
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => remove("equipamentos", a.id)}
                      >
                        Inativar
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="empty compact">Nenhum equipamento.</p>
            )}
            <h3>Histórico de atendimentos</h3>
            {historicoQuery.isLoading ? <p className="empty compact">Carregando atendimentos...</p> : historico.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>OS</th>
                      <th>Serviço</th>
                      <th>Técnico</th>
                      <th>Status</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((o) => (
                      <tr key={o.id}>
                        <td>{o.numero || `#${o.id}`}</td>
                        <td>{label(o.tipo_servico)}</td>
                        <td>{o.tecnico_nome}</td>
                        <td>{label(o.status)}</td>
                        <td>{money(o.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty compact">Nenhum atendimento.</p>
            )}
            {historicoQuery.hasNextPage && <button disabled={historicoQuery.isFetchingNextPage}
              onClick={() => historicoQuery.fetchNextPage()}>
              {historicoQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais atendimentos"}
            </button>}
            {manage && (
              <button
                className="danger-button wide"
                onClick={() => remove("clientes", selected.id)}
              >
                Inativar cliente
              </button>
            )}
          </section>
        </div>
      )}
      {clientForm && (
        <Modal
          title={clientForm.id ? "Editar cliente" : "Novo cliente"}
          close={() => setClientForm(null)}
          wide
        >
          <form onSubmit={saveClient}>
            <h3 className="form-section-title">Identificação e contato</h3>
            <div className="form-grid">
              <Field
                label="Nome / Razão social *"
                name="nome"
                form={clientForm}
                set={setClientForm}
                required
              />
              <Field
                label="CPF ou CNPJ"
                name="cpf_cnpj"
                form={clientForm}
                set={setClientForm}
                valueFormatter={mascaraDocumento}
                inputMode="numeric"
              />
              <Field
                label="Telefone com DDD"
                name="telefone"
                form={clientForm}
                set={setClientForm}
                valueFormatter={mascaraTelefone}
                inputMode="tel"
              />
              {!clientForm.id && (
                <Field
                  label="Quantidade de ar-condicionados"
                  name="quantidade_aparelhos"
                  type="number"
                  min="0"
                  max="200"
                  form={clientForm}
                  set={setClientForm}
                />
              )}
            </div>
            <h3 className="form-section-title">Endereço</h3>
            <div className="cep-row">
              <Field
                label="CEP *"
                name="cep"
                form={clientForm}
                set={setClientForm}
                valueFormatter={mascaraCep}
                inputMode="numeric"
                maxLength="9"
              />
              <button type="button" onClick={buscarCep} disabled={buscandoCep}>
                {buscandoCep ? "Consultando..." : "Buscar CEP"}
              </button>
            </div>
            <div className="form-grid">
              <Field
                label="Logradouro"
                name="endereco"
                form={clientForm}
                set={setClientForm}
              />
              <Field
                label="Número"
                name="numero"
                form={clientForm}
                set={setClientForm}
              />
              <Field
                label="Complemento"
                name="complemento"
                form={clientForm}
                set={setClientForm}
              />
              <Field
                label="Bairro"
                name="bairro"
                form={clientForm}
                set={setClientForm}
              />
              <Field
                label="Cidade"
                name="cidade"
                form={clientForm}
                set={setClientForm}
              />
              <Field
                label="Estado"
                name="estado"
                form={clientForm}
                set={setClientForm}
                maxLength="2"
              />
            </div>
            <p className="map-help">
              Clique no mapa para ajustar o ponto exato do atendimento.
            </p>
            <LocationPicker form={clientForm} setForm={setClientForm} />
            <Actions close={() => setClientForm(null)} saving={saving} />
          </form>
        </Modal>
      )}
      {equipmentForm && (
        <Modal
          title={equipmentForm.id ? "Editar equipamento" : "Novo equipamento"}
          close={() => setEquipmentForm(null)}
        >
          <form onSubmit={saveEquipment}>
            <div className="form-grid">
              <Field
                label="Marca"
                name="marca"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Modelo"
                name="modelo"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Capacidade"
                name="capacidade"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Ambiente"
                name="ambiente"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Número de série"
                name="numero_serie"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Patrimônio"
                name="patrimonio"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Tipo de gás"
                name="tipo_gas"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Instalado em"
                name="instalado_em"
                type="date"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Garantia até"
                name="garantia_ate"
                type="date"
                form={equipmentForm}
                set={setEquipmentForm}
              />
              <Field
                label="Próxima manutenção"
                name="proxima_manutencao"
                type="date"
                form={equipmentForm}
                set={setEquipmentForm}
              />
            </div>
            <label>Observações</label>
            <textarea
              value={equipmentForm.observacoes || ""}
              onChange={(e) =>
                setEquipmentForm({
                  ...equipmentForm,
                  observacoes: e.target.value,
                })
              }
            />
            <Actions close={() => setEquipmentForm(null)} />
          </form>
        </Modal>
      )}
      {qr && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&fecharQr()}><section className="form-modal qr-modal"><div className="modal-title"><div><span className="eyebrow">ETIQUETA DO EQUIPAMENTO</span><h2>{[qr.equipamento.marca,qr.equipamento.modelo].filter(Boolean).join(" ")||"Ar-condicionado"}</h2></div><button onClick={fecharQr}>×</button></div><img src={qr.url} alt="QR Code do equipamento"/><p>Imprima e cole esta etiqueta no aparelho. Ao escanear, o cliente verá a ficha e poderá solicitar atendimento.</p><button className="primary" onClick={()=>window.print()}>Imprimir etiqueta</button></section></div>}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
