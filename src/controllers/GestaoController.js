const { z } = require('zod');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { padroes } = require('../middlewares/permissaoMiddleware');

const contratoSchema = z.object({
  cliente_id: z.coerce.number().int().positive(), nome: z.string().trim().min(3).max(150),
  periodicidade_meses: z.coerce.number().int().min(1).max(24), valor_mensal: z.coerce.number().nonnegative(),
  inicio: z.string().date(), fim: z.union([z.string().date(), z.literal('')]).optional(),
  proxima_visita: z.string().date(), observacoes: z.string().max(2000).optional().default(''),
  aparelhos: z.array(z.coerce.number().int().positive()).max(100).default([]),
}).strict();

const tecnicoSchema = z.object({
  nome: z.string().trim().min(3).max(150),
  email: z.string().trim().email().max(150).transform((valor) => valor.toLowerCase()),
  senha: z.string().min(8).max(100),
}).strict();

class GestaoController {
  async listarTecnicos(req, res) {
    try {
      const result = await db.query(
        `SELECT id,nome,email,perfil,ativo,created_at FROM usuarios
         WHERE empresa_id=$1 AND perfil='TECNICO' AND deleted_at IS NULL ORDER BY ativo DESC,nome`,
        [req.usuarioLogado.empresa_id]
      );
      return res.json(result.rows);
    } catch (error) { return res.status(500).json({ erro: 'Falha ao listar técnicos.' }); }
  }

  async criarTecnico(req, res) {
    const validacao = tecnicoSchema.safeParse(req.body);
    if (!validacao.success) return res.status(400).json({
      erro: 'Revise os dados do técnico.',
      detalhes: validacao.error.issues.map((item) => ({ campo: item.path.join('.'), mensagem: item.message })),
    });
    try {
      const { nome, email, senha } = validacao.data;
      const existente = await db.query('SELECT id FROM usuarios WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
      if (existente.rows[0]) return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
      const senhaHash = await bcrypt.hash(senha, 12);
      const result = await db.query(
        `INSERT INTO usuarios(empresa_id,nome,email,senha_hash,perfil)
         VALUES($1,$2,$3,$4,'TECNICO') RETURNING id,nome,email,perfil,ativo,created_at`,
        [req.usuarioLogado.empresa_id, nome, email, senhaHash]
      );
      return res.status(201).json({ mensagem: 'Técnico cadastrado.', tecnico: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
      return res.status(500).json({ erro: 'Falha ao cadastrar técnico.' });
    }
  }
  async registrarPush(req,res){const token=String(req.body.token||'');if(!/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(token))return res.status(400).json({erro:'Token push inválido.'});try{await db.query(`INSERT INTO dispositivos_push(empresa_id,usuario_id,token,plataforma)VALUES($1,$2,$3,$4) ON CONFLICT(token)DO UPDATE SET empresa_id=EXCLUDED.empresa_id,usuario_id=EXCLUDED.usuario_id,plataforma=EXCLUDED.plataforma,ativo=TRUE,updated_at=NOW()`,[req.usuarioLogado.empresa_id,req.usuarioLogado.usuario_id,token,String(req.body.plataforma||'').slice(0,20)]);return res.sendStatus(204)}catch(e){return res.status(500).json({erro:'Falha ao registrar dispositivo.'})}}
  async listarPermissoes(req,res){try{const r=await db.query(`SELECT u.id,u.nome,u.email,u.perfil,COALESCE(json_agg(json_build_object('permissao',p.permissao,'permitido',p.permitido)) FILTER(WHERE p.permissao IS NOT NULL),'[]') overrides FROM usuarios u LEFT JOIN usuario_permissoes p ON p.usuario_id=u.id WHERE u.empresa_id=$1 AND u.ativo=TRUE GROUP BY u.id ORDER BY u.nome`,[req.usuarioLogado.empresa_id]);return res.json({padroes,usuarios:r.rows})}catch(e){return res.status(500).json({erro:'Falha ao listar permissões.'})}}
  async salvarPermissoes(req,res){if(!Array.isArray(req.body.permissoes)||req.body.permissoes.some(p=>typeof p!=='string'||p.length>60))return res.status(400).json({erro:'Lista de permissões inválida.'});try{await db.transaction(async c=>{const u=await c.query('SELECT id,perfil FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE',[req.params.id,req.usuarioLogado.empresa_id]);if(!u.rows[0])throw Object.assign(new Error('Usuário não encontrado.'),{status:404});await c.query('DELETE FROM usuario_permissoes WHERE usuario_id=$1',[req.params.id]);const base=new Set((padroes[u.rows[0].perfil]||[]).filter(p=>p!=='*'));for(const permissao of req.body.permissoes){if(!base.has(permissao))await c.query('INSERT INTO usuario_permissoes(usuario_id,permissao,permitido)VALUES($1,$2,TRUE)',[req.params.id,permissao])}for(const permissao of base){if(!req.body.permissoes.includes(permissao))await c.query('INSERT INTO usuario_permissoes(usuario_id,permissao,permitido)VALUES($1,$2,FALSE)',[req.params.id,permissao])}});return res.sendStatus(204)}catch(e){return res.status(e.status||500).json({erro:e.status?e.message:'Falha ao salvar permissões.'})}}
  async listarChecklist(req,res){try{const r=await db.query('SELECT id,item,ordem,obrigatorio,exige_observacao_nao_conforme,exige_foto,medicao_campo,valor_minimo,valor_maximo FROM checklist_modelos WHERE empresa_id=$1 AND tipo_servico=$2 AND ativo=TRUE ORDER BY ordem,id',[req.usuarioLogado.empresa_id,req.params.tipo]);return res.json(r.rows)}catch(e){return res.status(500).json({erro:'Falha ao listar checklist.'})}}
  async salvarChecklist(req,res){if(!Array.isArray(req.body.itens)||!req.body.itens.length||req.body.itens.some(i=>typeof i.item!=='string'||i.item.trim().length<2))return res.status(400).json({erro:'Checklist inválido.'});try{await db.transaction(async c=>{await c.query('UPDATE checklist_modelos SET ativo=FALSE WHERE empresa_id=$1 AND tipo_servico=$2',[req.usuarioLogado.empresa_id,req.params.tipo]);for(const [ordem,item] of req.body.itens.entries())await c.query(`INSERT INTO checklist_modelos(empresa_id,tipo_servico,item,ordem,obrigatorio,exige_observacao_nao_conforme,exige_foto,medicao_campo,valor_minimo,valor_maximo,ativo)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) ON CONFLICT((COALESCE(empresa_id,0)),tipo_servico,item) DO UPDATE SET ordem=EXCLUDED.ordem,obrigatorio=EXCLUDED.obrigatorio,exige_observacao_nao_conforme=EXCLUDED.exige_observacao_nao_conforme,exige_foto=EXCLUDED.exige_foto,medicao_campo=EXCLUDED.medicao_campo,valor_minimo=EXCLUDED.valor_minimo,valor_maximo=EXCLUDED.valor_maximo,ativo=TRUE`,[req.usuarioLogado.empresa_id,req.params.tipo,item.item.trim(),ordem,item.obrigatorio!==false,item.exige_observacao_nao_conforme!==false,item.exige_foto===true,item.medicao_campo||null,item.valor_minimo===''||item.valor_minimo==null?null:Number(item.valor_minimo),item.valor_maximo===''||item.valor_maximo==null?null:Number(item.valor_maximo)])});return res.sendStatus(204)}catch(e){return res.status(500).json({erro:'Falha ao salvar checklist.'})}}
  async listarContratos(req, res) {
    try {
      const r = await db.query(`SELECT ct.*,to_char(ct.proxima_visita,'YYYY-MM-DD') proxima_visita,c.nome cliente_nome,COUNT(ca.aparelho_id)::int total_equipamentos
        FROM contratos ct JOIN clientes c ON c.id=ct.cliente_id AND c.empresa_id=ct.empresa_id
        LEFT JOIN contrato_aparelhos ca ON ca.contrato_id=ct.id WHERE ct.empresa_id=$1
        GROUP BY ct.id,c.id ORDER BY ct.proxima_visita,ct.created_at DESC`, [req.usuarioLogado.empresa_id]);
      return res.json(r.rows);
    } catch (e) { return res.status(500).json({ erro: 'Falha ao listar contratos.' }); }
  }
  async criarContrato(req, res) {
    const v = contratoSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ erro: 'Contrato inválido.', detalhes: v.error.issues });
    try {
      const ct = await db.transaction(async (c) => {
        const d=v.data; const cliente=await c.query('SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL',[d.cliente_id,req.usuarioLogado.empresa_id]);
        if(!cliente.rows[0]) throw Object.assign(new Error('Cliente inválido.'),{status:400});
        if(d.aparelhos.length){const a=await c.query('SELECT id FROM aparelhos WHERE id=ANY($1::int[]) AND cliente_id=$2 AND empresa_id=$3 AND deleted_at IS NULL',[d.aparelhos,d.cliente_id,req.usuarioLogado.empresa_id]);if(a.rowCount!==d.aparelhos.length)throw Object.assign(new Error('Equipamento inválido.'),{status:400});}
        const r=await c.query(`INSERT INTO contratos(empresa_id,cliente_id,nome,periodicidade_meses,valor_mensal,inicio,fim,proxima_visita,observacoes,criado_por)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[req.usuarioLogado.empresa_id,d.cliente_id,d.nome,d.periodicidade_meses,d.valor_mensal,d.inicio,d.fim||null,d.proxima_visita,d.observacoes||null,req.usuarioLogado.usuario_id]);
        for(const id of d.aparelhos) await c.query('INSERT INTO contrato_aparelhos(contrato_id,aparelho_id)VALUES($1,$2)',[r.rows[0].id,id]); return r.rows[0];
      }); return res.status(201).json(ct);
    } catch(e){return res.status(e.status||500).json({erro:e.status?e.message:'Falha ao criar contrato.'});}
  }
  async gerarVisita(req,res) {
    const validacao=z.object({tecnico_id:z.coerce.number().int().positive(),agendado_para:z.string().datetime({offset:true}),duracao_prevista_minutos:z.coerce.number().int().min(15).max(480).default(120),competencia:z.string().date()}).strict().safeParse(req.body);
    const id=Number(req.params.id);
    if(!validacao.success||!Number.isInteger(id)||id<=0)return res.status(400).json({erro:'Informe tecnico, horario, duracao e competencia validos.'});
    try{return res.status(201).json(await require('../services/ContratoService').gerarVisitas(id,req.usuarioLogado,validacao.data))}
    catch(e){return res.status(e.status||500).json({erro:e.status?e.message:'Falha ao gerar visita.'})}
  }
  async notificacoes(req,res) {
    try{const r=await db.query('SELECT * FROM notificacoes WHERE empresa_id=$1 AND (usuario_id=$2 OR usuario_id IS NULL) ORDER BY lida,created_at DESC LIMIT 100',[req.usuarioLogado.empresa_id,req.usuarioLogado.usuario_id]);return res.json(r.rows)}
    catch(e){return res.status(500).json({erro:'Falha ao carregar notificacoes.'})}
  }
  async lerNotificacao(req,res){try{await db.query('UPDATE notificacoes SET lida=TRUE WHERE id=$1 AND empresa_id=$2 AND (usuario_id=$3 OR usuario_id IS NULL)',[req.params.id,req.usuarioLogado.empresa_id,req.usuarioLogado.usuario_id]);return res.sendStatus(204)}catch(e){return res.status(500).json({erro:'Falha ao atualizar notificação.'})}}
  async agenda(req,res){try{const params=[req.usuarioLogado.empresa_id],where=['os.empresa_id=$1','os.deleted_at IS NULL'];if(req.query.data){params.push(req.query.data);where.push(`os.agendado_para::date=$${params.length}::date`)}if(req.query.tecnico_id){params.push(req.query.tecnico_id);where.push(`os.tecnico_id=$${params.length}`)}const r=await db.query(`SELECT os.id,os.status,os.tipo_servico,os.agendado_para,c.nome cliente_nome,u.nome tecnico_nome,c.endereco,c.latitude,c.longitude FROM ordens_servico os JOIN clientes c ON c.id=os.cliente_id JOIN usuarios u ON u.id=os.tecnico_id WHERE ${where.join(' AND ')} ORDER BY os.agendado_para NULLS LAST`,params);return res.json(r.rows)}catch(e){return res.status(500).json({erro:'Falha ao carregar agenda.'})}}
}
module.exports=new GestaoController();
