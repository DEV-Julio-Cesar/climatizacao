const { z } = require('zod');
const db = require('../config/database');
const schema = z.object({ itens: z.array(z.object({ id:z.number().int().positive(), tipo:z.enum(['CRIAR_OS','STATUS_OS','EVENTO_OS','EXECUCAO_OS','RETORNO_OS','AGENDAR_OS','FOTO_OS']), os_id:z.number().int().positive().optional(), cliente_id:z.number().int().positive().optional() }).strict()).max(1000) }).strict();
module.exports = {
  async verificarLegado(req,res) {
    const parsed=schema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({erro:'Referências inválidas.'});
    try {
      const itens=parsed.data.itens;
      const [ordens,clientes]=await Promise.all([
        db.query('SELECT id FROM ordens_servico WHERE id=ANY($1::int[]) AND empresa_id=$2 AND deleted_at IS NULL',[itens.map(i=>i.os_id).filter(Boolean),req.usuarioLogado.empresa_id]),
        db.query('SELECT id FROM clientes WHERE id=ANY($1::int[]) AND empresa_id=$2 AND deleted_at IS NULL',[itens.map(i=>i.cliente_id).filter(Boolean),req.usuarioLogado.empresa_id]),
      ]);
      const os=new Set(ordens.rows.map(o=>o.id)),cli=new Set(clientes.rows.map(c=>c.id));
      return res.json({ autorizados:itens.filter(i=>i.tipo==='CRIAR_OS'?cli.has(i.cliente_id):os.has(i.os_id)).map(i=>i.id) });
    } catch { return res.status(500).json({erro:'Falha ao verificar os registros antigos.'}); }
  },
};
