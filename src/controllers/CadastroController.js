const db = require("../config/database");
const QRCode = require("qrcode");

class CadastroController {
  async listarTecnicos(req, res) {
    try {
      const result = await db.query(
        "SELECT id, nome, perfil FROM usuarios WHERE empresa_id = $1 AND ativo = TRUE AND deleted_at IS NULL AND perfil IN ('TECNICO', 'GESTOR') ORDER BY nome",
        [req.usuarioLogado.empresa_id],
      );
      return res.json(result.rows);
    } catch (error) {
      return res.status(500).json({ erro: "Falha ao listar técnicos." });
    }
  }

  async listarClientes(req, res) {
    try {
      const result = await db.query(
        `SELECT c.id, c.nome, c.telefone, c.cpf_cnpj, c.endereco, c.numero, c.complemento, c.bairro,
                c.cep, c.cidade, c.estado, c.latitude, c.longitude,
                COALESCE(json_agg(json_build_object('id', a.id, 'marca', a.marca, 'modelo', a.modelo, 'capacidade', a.capacidade,
                  'numero_serie',a.numero_serie,'patrimonio',a.patrimonio,'tipo_gas',a.tipo_gas,'ambiente',a.ambiente,
                  'proxima_manutencao',a.proxima_manutencao))
                  FILTER (WHERE a.id IS NOT NULL), '[]') AS aparelhos
         FROM clientes c LEFT JOIN aparelhos a ON a.cliente_id = c.id AND a.deleted_at IS NULL
         WHERE c.empresa_id = $1 AND c.deleted_at IS NULL GROUP BY c.id ORDER BY c.nome`,
        [req.usuarioLogado.empresa_id],
      );
      return res.json(result.rows);
    } catch (error) {
      return res.status(500).json({ erro: "Falha ao listar clientes." });
    }
  }

  async criarCliente(req, res) {
    try {
      const d = req.body;
      const r = await db.transaction(async (client) => {
        const criado = await client.query(
          `INSERT INTO clientes (empresa_id,nome,telefone,cpf_cnpj,endereco,numero,complemento,bairro,cep,cidade,estado,latitude,longitude)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            req.usuarioLogado.empresa_id,
            d.nome,
            normalizarTelefone(d.telefone),
            somenteDigitos(d.cpf_cnpj),
            d.endereco || null,
            d.numero || null,
            d.complemento || null,
            d.bairro || null,
            somenteDigitos(d.cep),
            d.cidade || null,
            d.estado?.toUpperCase() || null,
            d.latitude ?? null,
            d.longitude ?? null,
          ],
        );
        for (let i = 0; i < d.quantidade_aparelhos; i += 1)
          await client.query(
            "INSERT INTO aparelhos (empresa_id,cliente_id,ambiente,observacoes) VALUES ($1,$2,$3,$4)",
            [
              req.usuarioLogado.empresa_id,
              criado.rows[0].id,
              `Aparelho ${i + 1}`,
              "Cadastro inicial — complete os dados do equipamento.",
            ],
          );
        return criado;
      });
      return res.status(201).json(r.rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res
          .status(409)
          .json({ erro: "CPF/CNPJ já cadastrado para outro cliente." });
      return res.status(500).json({ erro: "Falha ao cadastrar cliente." });
    }
  }

  async atualizarCliente(req, res) {
    try {
      const d = req.body;
      const r = await db.query(
        `UPDATE clientes SET nome=$1,telefone=$2,cpf_cnpj=$3,endereco=$4,numero=$5,complemento=$6,bairro=$7,cep=$8,cidade=$9,estado=$10,latitude=$11,longitude=$12
         WHERE id=$13 AND empresa_id=$14 AND deleted_at IS NULL RETURNING *`,
        [
          d.nome,
          normalizarTelefone(d.telefone),
          somenteDigitos(d.cpf_cnpj),
          d.endereco || null,
          d.numero || null,
          d.complemento || null,
          d.bairro || null,
          somenteDigitos(d.cep),
          d.cidade || null,
          d.estado?.toUpperCase() || null,
          d.latitude ?? null,
          d.longitude ?? null,
          req.params.id,
          req.usuarioLogado.empresa_id,
        ],
      );
      if (!r.rows[0])
        return res.status(404).json({ erro: "Cliente não encontrado." });
      return res.json(r.rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res
          .status(409)
          .json({ erro: "CPF/CNPJ já cadastrado para outro cliente." });
      return res.status(500).json({ erro: "Falha ao atualizar cliente." });
    }
  }

  async criarEquipamento(req, res) {
    return this._salvarEquipamento(req, res, false);
  }
  async atualizarEquipamento(req, res) {
    return this._salvarEquipamento(req, res, true);
  }
  async _salvarEquipamento(req, res, atualizar) {
    const d = req.body;
    try {
      const cliente = await db.query(
        "SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL",
        [d.cliente_id, req.usuarioLogado.empresa_id],
      );
      if (!cliente.rows[0])
        return res.status(400).json({ erro: "Cliente inválido." });
      const params = [
        d.cliente_id,
        d.marca || null,
        d.modelo || null,
        d.capacidade || null,
        d.numero_serie || null,
        d.patrimonio || null,
        d.tipo_gas || null,
        d.ambiente || null,
        d.instalado_em || null,
        d.garantia_ate || null,
        d.proxima_manutencao || null,
        d.observacoes || null,
      ];
      let r;
      if (atualizar)
        r = await db.query(
          `UPDATE aparelhos SET cliente_id=$1,marca=$2,modelo=$3,capacidade=$4,numero_serie=$5,patrimonio=$6,tipo_gas=$7,ambiente=$8,instalado_em=$9,garantia_ate=$10,proxima_manutencao=$11,observacoes=$12 WHERE id=$13 AND empresa_id=$14 AND deleted_at IS NULL RETURNING *`,
          [...params, req.params.id, req.usuarioLogado.empresa_id],
        );
      else
        r = await db.query(
          `INSERT INTO aparelhos (empresa_id,cliente_id,marca,modelo,capacidade,numero_serie,patrimonio,tipo_gas,ambiente,instalado_em,garantia_ate,proxima_manutencao,observacoes) VALUES ($13,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [...params, req.usuarioLogado.empresa_id],
        );
      if (!r.rows[0])
        return res.status(404).json({ erro: "Equipamento não encontrado." });
      return res.status(atualizar ? 200 : 201).json(r.rows[0]);
    } catch (e) {
      console.error(e.message);
      return res.status(500).json({ erro: "Falha ao salvar equipamento." });
    }
  }

  async detalheEquipamento(req, res) {
    try {
      const eq = await db.query(
        `SELECT a.*,c.nome AS cliente_nome,c.telefone AS cliente_telefone,c.endereco AS cliente_endereco FROM aparelhos a JOIN clientes c ON c.id=a.cliente_id WHERE a.id=$1 AND a.empresa_id=$2 AND a.deleted_at IS NULL`,
        [req.params.id, req.usuarioLogado.empresa_id],
      );
      if (!eq.rows[0])
        return res.status(404).json({ erro: "Equipamento não encontrado." });
      const hist = await db.query(
        `SELECT id,tipo_servico,status,diagnostico,solucao_aplicada,valor_total,finalizado_em FROM ordens_servico WHERE aparelho_id=$1 AND empresa_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30`,
        [req.params.id, req.usuarioLogado.empresa_id],
      );
      return res.json({ ...eq.rows[0], historico: hist.rows });
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao carregar equipamento." });
    }
  }

  async qrEquipamento(req, res) {
    try {
      const r = await db.query(
        "SELECT public_id FROM aparelhos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL",
        [req.params.id, req.usuarioLogado.empresa_id],
      );
      if (!r.rows[0])
        return res.status(404).json({ erro: "Equipamento não encontrado." });
      const base =
          process.env.APP_URL ||
          (process.env.RENDER_EXTERNAL_HOSTNAME
            ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
            : "http://localhost:3000"),
        url = `${base}/equipamentos/publico/${r.rows[0].public_id}`,
        svg = await QRCode.toString(url, {
          type: "svg",
          width: 420,
          margin: 2,
          color: { dark: "#102b3a", light: "#ffffff" },
        });
      res.type("image/svg+xml").send(svg);
    } catch {
      return res.status(500).json({ erro: "Falha ao gerar QR Code." });
    }
  }

  async equipamentoPublico(req, res) {
    try {
      const r = await db.query(
        `SELECT a.marca,a.modelo,a.capacidade,a.numero_serie,a.patrimonio,a.tipo_gas,a.ambiente,a.instalado_em,a.garantia_ate,a.proxima_manutencao,e.nome empresa_nome,e.telefone empresa_telefone FROM aparelhos a JOIN empresas e ON e.id=a.empresa_id WHERE a.public_id=$1 AND a.deleted_at IS NULL AND e.ativo=TRUE`,
        [req.params.token],
      );
      if (!r.rows[0])
        return res.status(404).send("<h1>Equipamento não encontrado</h1>");
      const x = r.rows[0],
        esc = (v) =>
          String(v || "-").replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c],
          );
      return res
        .type("html")
        .send(
          `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Ficha do equipamento</title><style>body{font-family:system-ui;background:#f3f7f8;color:#15303d;margin:0;padding:25px}.card{max-width:620px;margin:auto;background:#fff;border-radius:18px;padding:25px;box-shadow:0 10px 35px #1232}h1{color:#0784a5}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid div{background:#f5f8f9;padding:12px;border-radius:9px}.grid small{display:block;color:#71818a}a{display:block;text-align:center;background:#0784a5;color:#fff;padding:12px;border-radius:9px;text-decoration:none;margin-top:20px}@media(max-width:520px){.grid{grid-template-columns:1fr}}</style><div class="card"><small>${esc(x.empresa_nome)}</small><h1>${esc([x.marca, x.modelo].filter(Boolean).join(" ") || "Ar-condicionado")}</h1><div class="grid"><div><small>Ambiente</small>${esc(x.ambiente)}</div><div><small>Capacidade</small>${esc(x.capacidade)}</div><div><small>Número de série</small>${esc(x.numero_serie)}</div><div><small>Patrimônio</small>${esc(x.patrimonio)}</div><div><small>Tipo de gás</small>${esc(x.tipo_gas)}</div><div><small>Próxima manutenção</small>${esc(x.proxima_manutencao ? new Date(x.proxima_manutencao).toLocaleDateString("pt-BR") : "-")}</div></div>${x.empresa_telefone ? `<a href="tel:${esc(x.empresa_telefone)}">Solicitar atendimento</a>` : ""}</div>`,
        );
    } catch {
      return res.status(404).send("<h1>Equipamento não encontrado</h1>");
    }
  }

  async alertasEquipamentos(req, res) {
    try {
      const r = await db.query(
        `SELECT a.id,a.marca,a.modelo,a.ambiente,a.garantia_ate,a.proxima_manutencao,c.nome cliente_nome,CASE WHEN a.proxima_manutencao<CURRENT_DATE THEN 'MANUTENCAO_ATRASADA' WHEN a.proxima_manutencao<=CURRENT_DATE+INTERVAL '30 days' THEN 'MANUTENCAO_PROXIMA' WHEN a.garantia_ate BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '30 days' THEN 'GARANTIA_VENCENDO' END alerta FROM aparelhos a JOIN clientes c ON c.id=a.cliente_id WHERE a.empresa_id=$1 AND a.deleted_at IS NULL AND (a.proxima_manutencao<=CURRENT_DATE+INTERVAL '30 days' OR a.garantia_ate BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '30 days') ORDER BY a.proxima_manutencao NULLS LAST,a.garantia_ate NULLS LAST`,
        [req.usuarioLogado.empresa_id],
      );
      return res.json(r.rows);
    } catch {
      return res
        .status(500)
        .json({ erro: "Falha ao carregar alertas de equipamentos." });
    }
  }

  async detalheCliente(req, res) {
    try {
      const cliente = await db.query(
        "SELECT * FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL",
        [req.params.id, req.usuarioLogado.empresa_id],
      );
      if (!cliente.rows[0])
        return res.status(404).json({ erro: "Cliente não encontrado." });
      const [equipamentos, ordens] = await Promise.all([
        db.query(
          `SELECT *,to_char(instalado_em,'YYYY-MM-DD') instalado_em,to_char(garantia_ate,'YYYY-MM-DD') garantia_ate,to_char(proxima_manutencao,'YYYY-MM-DD') proxima_manutencao FROM aparelhos WHERE cliente_id=$1 AND empresa_id=$2 AND deleted_at IS NULL ORDER BY ambiente,marca,modelo`,
          [req.params.id, req.usuarioLogado.empresa_id],
        ),
        db.query(
          `SELECT os.id,os.tipo_servico,os.status,os.valor_total,os.agendado_para,os.finalizado_em,u.nome tecnico_nome,a.marca aparelho_marca,a.modelo aparelho_modelo FROM ordens_servico os JOIN usuarios u ON u.id=os.tecnico_id LEFT JOIN aparelhos a ON a.id=os.aparelho_id WHERE os.cliente_id=$1 AND os.empresa_id=$2 AND os.deleted_at IS NULL ORDER BY os.created_at DESC LIMIT 100`,
          [req.params.id, req.usuarioLogado.empresa_id],
        ),
      ]);
      return res.json({
        ...cliente.rows[0],
        aparelhos: equipamentos.rows,
        ordens: ordens.rows,
      });
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao carregar cliente." });
    }
  }

  async inativarCliente(req, res) {
    try {
      const r = await db.transaction(async (c) => {
        const cliente = await c.query(
          "UPDATE clientes SET deleted_at=NOW() WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL RETURNING id",
          [req.params.id, req.usuarioLogado.empresa_id],
        );
        if (!cliente.rows[0]) return null;
        await c.query(
          "UPDATE aparelhos SET deleted_at=NOW() WHERE cliente_id=$1 AND empresa_id=$2 AND deleted_at IS NULL",
          [req.params.id, req.usuarioLogado.empresa_id],
        );
        return cliente.rows[0];
      });
      if (!r) return res.status(404).json({ erro: "Cliente não encontrado." });
      return res.sendStatus(204);
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao inativar cliente." });
    }
  }

  async inativarEquipamento(req, res) {
    try {
      const r = await db.query(
        "UPDATE aparelhos SET deleted_at=NOW() WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL RETURNING id",
        [req.params.id, req.usuarioLogado.empresa_id],
      );
      if (!r.rows[0])
        return res.status(404).json({ erro: "Equipamento não encontrado." });
      return res.sendStatus(204);
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao inativar equipamento." });
    }
  }
}

module.exports = new CadastroController();

function somenteDigitos(valor) {
  const n = String(valor || "").replace(/\D/g, "");
  return n || null;
}
function normalizarTelefone(valor) {
  const n = String(valor || "").replace(/\D/g, "");
  return n || null;
}
