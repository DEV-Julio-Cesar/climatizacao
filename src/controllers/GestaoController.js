const { z } = require('zod');
const db = require('../config/database');

const contratoSchema = z.object({
  cliente_id: z.coerce.number().int().positive(), nome: z.string().trim().min(3).max(150),
  periodicidade_meses: z.coerce.number().int().min(1).max(24), valor_mensal: z.coerce.number().nonnegative(),
  inicio: z.string().date(), fim: z.union([z.string().date(), z.literal('')]).optional(),
  proxima_visita: z.string().date(), observacoes: z.string().max(2000).optional().default(''),
  aparelhos: z.array(z.coerce.number().int().positive()).max(100).default([]),
}).strict();

class GestaoController {
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
  async gerarVisita(req,res){
    try{const os=await db.transaction(async c=>{const ct=await c.query("SELECT * FROM contratos WHERE id=$1 AND empresa_id=$2 AND status='ATIVO' FOR UPDATE",[req.params.id,req.usuarioLogado.empresa_id]);if(!ct.rows[0])throw Object.assign(new Error('Contrato ativo não encontrado.'),{status:404});const ap=await c.query('SELECT aparelho_id FROM contrato_aparelhos WHERE contrato_id=$1 ORDER BY aparelho_id LIMIT 1',[req.params.id]);const r=await c.query(`INSERT INTO ordens_servico(empresa_id,cliente_id,aparelho_id,tecnico_id,tipo_servico,descricao_problema,agendado_para)
      VALUES($1,$2,$3,$4,'PREVENTIVA',$5,$6::date + time '09:00') RETURNING *`,[req.usuarioLogado.empresa_id,ct.rows[0].cliente_id,ap.rows[0]?.aparelho_id||null,req.usuarioLogado.usuario_id,`Manutenção preventiva - ${ct.rows[0].nome}`,ct.rows[0].proxima_visita]);await c.query("UPDATE contratos SET proxima_visita=(proxima_visita + (periodicidade_meses || ' months')::interval)::date,updated_at=NOW() WHERE id=$1",[req.params.id]);await c.query("INSERT INTO os_historico(os_id,status_anterior,status_novo,modificado_por,observacao)VALUES($1,NULL,'ABERTA',$2,$3)",[r.rows[0].id,req.usuarioLogado.usuario_id,`Gerada pelo contrato #${req.params.id}`]);return r.rows[0]});return res.status(201).json(os)}catch(e){return res.status(e.status||500).json({erro:e.message||'Falha ao gerar visita.'})}
  }
  async notificacoes(req,res){
    try{const e=req.usuarioLogado.empresa_id,u=req.usuarioLogado.usuario_id;await db.query(`INSERT INTO notificacoes(empresa_id,usuario_id,tipo,titulo,mensagem,referencia_tipo,referencia_id)
      SELECT $1,$2,'MANUTENCAO','Manutenção programada',c.nome||' vence em '||to_char(c.proxima_visita,'DD/MM/YYYY'),'CONTRATO',c.id FROM contratos c
      WHERE c.empresa_id=$1 AND c.status='ATIVO' AND c.proxima_visita BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '15 days'
      AND NOT EXISTS(SELECT 1 FROM notificacoes n WHERE n.usuario_id=$2 AND n.referencia_tipo='CONTRATO' AND n.referencia_id=c.id AND n.created_at::date=CURRENT_DATE)`,[e,u]);const r=await db.query('SELECT * FROM notificacoes WHERE empresa_id=$1 AND (usuario_id=$2 OR usuario_id IS NULL) ORDER BY lida,created_at DESC LIMIT 100',[e,u]);return res.json(r.rows)}catch(e){return res.status(500).json({erro:'Falha ao carregar notificações.'})}
  }
  async lerNotificacao(req,res){try{await db.query('UPDATE notificacoes SET lida=TRUE WHERE id=$1 AND empresa_id=$2 AND (usuario_id=$3 OR usuario_id IS NULL)',[req.params.id,req.usuarioLogado.empresa_id,req.usuarioLogado.usuario_id]);return res.sendStatus(204)}catch(e){return res.status(500).json({erro:'Falha ao atualizar notificação.'})}}
  async relatorio(req,res){
    try{const e=req.usuarioLogado.empresa_id;const [os,receita,servicos,tecnicos,contratos]=await Promise.all([
      db.query(`SELECT COUNT(*)::int total,COUNT(*)FILTER(WHERE status='FINALIZADA')::int finalizadas,COUNT(*)FILTER(WHERE status='CANCELADA')::int canceladas,ROUND(AVG(EXTRACT(EPOCH FROM(finalizado_em-iniciado_em))/3600)::numeric,1) tempo_medio_horas FROM ordens_servico WHERE empresa_id=$1 AND created_at>=NOW()-INTERVAL '90 days'`,[e]),
      db.query(`SELECT COALESCE(SUM(valor_total)FILTER(WHERE status='FINALIZADA'),0) faturado,COALESCE((SELECT SUM(valor)FROM pagamentos WHERE empresa_id=$1 AND pago_em>=NOW()-INTERVAL '90 days'),0) recebido FROM ordens_servico WHERE empresa_id=$1 AND created_at>=NOW()-INTERVAL '90 days'`,[e]),
      db.query(`SELECT tipo_servico,COUNT(*)::int total,COALESCE(SUM(valor_total),0) valor FROM ordens_servico WHERE empresa_id=$1 AND created_at>=NOW()-INTERVAL '90 days' GROUP BY tipo_servico ORDER BY total DESC`,[e]),
      db.query(`SELECT u.nome,COUNT(os.id)::int atendimentos,COUNT(os.id)FILTER(WHERE os.status='FINALIZADA')::int finalizadas FROM usuarios u LEFT JOIN ordens_servico os ON os.tecnico_id=u.id AND os.created_at>=NOW()-INTERVAL '90 days' WHERE u.empresa_id=$1 AND u.ativo=TRUE GROUP BY u.id ORDER BY finalizadas DESC`,[e]),
      db.query("SELECT COUNT(*)FILTER(WHERE status='ATIVO')::int ativos,COALESCE(SUM(valor_mensal)FILTER(WHERE status='ATIVO'),0) receita_recorrente FROM contratos WHERE empresa_id=$1",[e])]);return res.json({periodo_dias:90,...os.rows[0],...receita.rows[0],contratos:contratos.rows[0],servicos:servicos.rows,tecnicos:tecnicos.rows})
    }catch(e){return res.status(500).json({erro:'Falha ao gerar relatório.'})}
  }
  async agenda(req,res){try{const params=[req.usuarioLogado.empresa_id],where=['os.empresa_id=$1','os.deleted_at IS NULL'];if(req.query.data){params.push(req.query.data);where.push(`os.agendado_para::date=$${params.length}::date`)}if(req.query.tecnico_id){params.push(req.query.tecnico_id);where.push(`os.tecnico_id=$${params.length}`)}const r=await db.query(`SELECT os.id,os.status,os.tipo_servico,os.agendado_para,c.nome cliente_nome,u.nome tecnico_nome,c.endereco FROM ordens_servico os JOIN clientes c ON c.id=os.cliente_id JOIN usuarios u ON u.id=os.tecnico_id WHERE ${where.join(' AND ')} ORDER BY os.agendado_para NULLS LAST`,params);return res.json(r.rows)}catch(e){return res.status(500).json({erro:'Falha ao carregar agenda.'})}}
}
module.exports=new GestaoController();
