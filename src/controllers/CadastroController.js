const db = require('../config/database');

class CadastroController {
  async listarTecnicos(req, res) {
    if (!['GESTOR', 'ADMIN'].includes(req.usuarioLogado.perfil)) {
      return res.status(403).json({ erro: 'Acesso restrito a gestores.' });
    }
    try {
      const result = await db.query(
        "SELECT id, nome, perfil FROM usuarios WHERE empresa_id = $1 AND ativo = TRUE AND deleted_at IS NULL AND perfil IN ('TECNICO', 'GESTOR') ORDER BY nome",
        [req.usuarioLogado.empresa_id]
      );
      return res.json(result.rows);
    } catch (error) {
      return res.status(500).json({ erro: 'Falha ao listar técnicos.' });
    }
  }

  async listarClientes(req, res) {
    try {
      const result = await db.query(
        `SELECT c.id, c.nome, c.telefone, c.endereco, c.latitude, c.longitude,
                COALESCE(json_agg(json_build_object('id', a.id, 'marca', a.marca, 'modelo', a.modelo, 'capacidade', a.capacidade,
                  'numero_serie',a.numero_serie,'patrimonio',a.patrimonio,'tipo_gas',a.tipo_gas,'ambiente',a.ambiente,
                  'proxima_manutencao',a.proxima_manutencao))
                  FILTER (WHERE a.id IS NOT NULL), '[]') AS aparelhos
         FROM clientes c LEFT JOIN aparelhos a ON a.cliente_id = c.id AND a.deleted_at IS NULL
         WHERE c.empresa_id = $1 AND c.deleted_at IS NULL GROUP BY c.id ORDER BY c.nome`,
        [req.usuarioLogado.empresa_id]
      );
      return res.json(result.rows);
    } catch (error) {
      return res.status(500).json({ erro: 'Falha ao listar clientes.' });
    }
  }

  async criarCliente(req, res) {
    try {
      const d=req.body; const r=await db.query(
        `INSERT INTO clientes (empresa_id,nome,telefone,endereco,cep,cidade,estado,latitude,longitude)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.usuarioLogado.empresa_id,d.nome,d.telefone||null,d.endereco||null,d.cep||null,d.cidade||null,d.estado?.toUpperCase()||null,d.latitude||null,d.longitude||null]);
      return res.status(201).json(r.rows[0]);
    } catch(e) { return res.status(500).json({erro:'Falha ao cadastrar cliente.'}); }
  }

  async atualizarCliente(req, res) {
    try {
      const d=req.body; const r=await db.query(
        `UPDATE clientes SET nome=$1,telefone=$2,endereco=$3,cep=$4,cidade=$5,estado=$6,latitude=$7,longitude=$8
         WHERE id=$9 AND empresa_id=$10 AND deleted_at IS NULL RETURNING *`,
        [d.nome,d.telefone||null,d.endereco||null,d.cep||null,d.cidade||null,d.estado?.toUpperCase()||null,d.latitude||null,d.longitude||null,req.params.id,req.usuarioLogado.empresa_id]);
      if(!r.rows[0]) return res.status(404).json({erro:'Cliente não encontrado.'}); return res.json(r.rows[0]);
    } catch(e) { return res.status(500).json({erro:'Falha ao atualizar cliente.'}); }
  }

  async criarEquipamento(req, res) { return this._salvarEquipamento(req,res,false); }
  async atualizarEquipamento(req, res) { return this._salvarEquipamento(req,res,true); }
  async _salvarEquipamento(req,res,atualizar) {
    const d=req.body;
    try {
      const cliente=await db.query('SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL',[d.cliente_id,req.usuarioLogado.empresa_id]);
      if(!cliente.rows[0]) return res.status(400).json({erro:'Cliente inválido.'});
      const params=[d.cliente_id,d.marca||null,d.modelo||null,d.capacidade||null,d.numero_serie||null,d.patrimonio||null,d.tipo_gas||null,d.ambiente||null,d.instalado_em||null,d.garantia_ate||null,d.proxima_manutencao||null,d.observacoes||null];
      let r;
      if(atualizar) r=await db.query(`UPDATE aparelhos SET cliente_id=$1,marca=$2,modelo=$3,capacidade=$4,numero_serie=$5,patrimonio=$6,tipo_gas=$7,ambiente=$8,instalado_em=$9,garantia_ate=$10,proxima_manutencao=$11,observacoes=$12 WHERE id=$13 AND empresa_id=$14 AND deleted_at IS NULL RETURNING *`,[...params,req.params.id,req.usuarioLogado.empresa_id]);
      else r=await db.query(`INSERT INTO aparelhos (empresa_id,cliente_id,marca,modelo,capacidade,numero_serie,patrimonio,tipo_gas,ambiente,instalado_em,garantia_ate,proxima_manutencao,observacoes) VALUES ($13,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[...params,req.usuarioLogado.empresa_id]);
      if(!r.rows[0]) return res.status(404).json({erro:'Equipamento não encontrado.'}); return res.status(atualizar?200:201).json(r.rows[0]);
    } catch(e) { console.error(e.message); return res.status(500).json({erro:'Falha ao salvar equipamento.'}); }
  }

  async detalheEquipamento(req,res) {
    try {
      const eq=await db.query(`SELECT a.*,c.nome AS cliente_nome,c.telefone AS cliente_telefone,c.endereco AS cliente_endereco FROM aparelhos a JOIN clientes c ON c.id=a.cliente_id WHERE a.id=$1 AND a.empresa_id=$2 AND a.deleted_at IS NULL`,[req.params.id,req.usuarioLogado.empresa_id]);
      if(!eq.rows[0]) return res.status(404).json({erro:'Equipamento não encontrado.'});
      const hist=await db.query(`SELECT id,tipo_servico,status,diagnostico,solucao_aplicada,valor_total,finalizado_em FROM ordens_servico WHERE aparelho_id=$1 AND empresa_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30`,[req.params.id,req.usuarioLogado.empresa_id]);
      return res.json({...eq.rows[0],historico:hist.rows});
    } catch(e) { return res.status(500).json({erro:'Falha ao carregar equipamento.'}); }
  }
}

module.exports = new CadastroController();
