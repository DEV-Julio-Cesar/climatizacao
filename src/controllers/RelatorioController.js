const { z } = require('zod');
const db = require('../config/database');

const filtrosSchema = z.object({
  tipo: z.enum(['os', 'pagamentos', 'estoque']),
  inicio: z.string().date().optional(),
  fim: z.string().date().optional(),
}).refine((dados) => !dados.inicio || !dados.fim || dados.inicio <= dados.fim, {
  message: 'O período inicial deve ser anterior ao final.',
});

const periodoSchema = z.object({
  inicio: z.string().date().optional(),
  fim: z.string().date().optional(),
}).refine((dados) => !dados.inicio || !dados.fim || dados.inicio <= dados.fim, {
  message: 'O período inicial deve ser anterior ao final.',
});

function protegerFormula(valor) {
  const texto = valor == null ? '' : String(valor);
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

function csv(rows) {
  if (!rows.length) return '\uFEFF';
  const colunas = Object.keys(rows[0]);
  const celula = (valor) => `"${protegerFormula(valor).replaceAll('"', '""')}"`;
  return `\uFEFF${colunas.map(celula).join(';')}\r\n${rows.map((row) => colunas.map((coluna) => celula(row[coluna])).join(';')).join('\r\n')}`;
}

function periodo(dados, coluna, params) {
  const partes = [];
  if (dados.inicio) { params.push(dados.inicio); partes.push(`${coluna} >= $${params.length}::date`); }
  if (dados.fim) { params.push(dados.fim); partes.push(`${coluna} < ($${params.length}::date + INTERVAL '1 day')`); }
  return partes;
}

const exportacoes = {
  os(dados, empresaId) {
    const params = [empresaId];
    const where = ['os.empresa_id=$1', 'os.deleted_at IS NULL', ...periodo(dados, 'os.created_at', params)];
    return db.query(`SELECT os.id AS numero,os.status,os.tipo_servico,c.nome AS cliente,u.nome AS tecnico,
      to_char(os.agendado_para AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS agendamento,
      os.valor_total,COALESCE(p.total_pago,0) AS total_pago,GREATEST(os.valor_total-COALESCE(p.total_pago,0),0) AS saldo_pendente,
      to_char(os.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS criada_em
      FROM ordens_servico os JOIN clientes c ON c.id=os.cliente_id JOIN usuarios u ON u.id=os.tecnico_id
      LEFT JOIN (SELECT os_id,SUM(valor) total_pago FROM pagamentos GROUP BY os_id) p ON p.os_id=os.id
      WHERE ${where.join(' AND ')} ORDER BY os.created_at DESC`, params);
  },
  pagamentos(dados, empresaId) {
    const params = [empresaId];
    const where = ['p.empresa_id=$1', ...periodo(dados, 'p.pago_em', params)];
    return db.query(`SELECT p.id,p.os_id AS ordem_servico,c.nome AS cliente,p.forma,p.valor,p.observacao,
      u.nome AS recebido_por,to_char(p.pago_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS recebido_em
      FROM pagamentos p JOIN ordens_servico os ON os.id=p.os_id JOIN clientes c ON c.id=os.cliente_id
      LEFT JOIN usuarios u ON u.id=p.recebido_por WHERE ${where.join(' AND ')} ORDER BY p.pago_em DESC`, params);
  },
  estoque(dados, empresaId) {
    const params = [empresaId];
    const where = ['m.empresa_id=$1', ...periodo(dados, 'm.created_at', params)];
    return db.query(`SELECT m.id,p.nome AS produto,p.sku,m.tipo,m.quantidade,m.observacao,
      u.nome AS usuario,t.nome AS tecnico,to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS movimentado_em
      FROM estoque_movimentos m JOIN produtos p ON p.id=m.produto_id LEFT JOIN usuarios u ON u.id=m.usuario_id
      LEFT JOIN usuarios t ON t.id=m.tecnico_id WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC`, params);
  },
};

class RelatorioController {
  async exportar(req, res) {
    const validacao = filtrosSchema.safeParse(req.query);
    if (!validacao.success) return res.status(400).json({ erro: 'Filtros de exportação inválidos.' });
    try {
      const resultado = await exportacoes[validacao.data.tipo](validacao.data, req.usuarioLogado.empresa_id);
      const nome = `${validacao.data.tipo}_${new Date().toISOString().slice(0, 10)}.csv`;
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
      return res.send(csv(resultado.rows));
    } catch (_error) { return res.status(500).json({ erro: 'Falha ao exportar relatório.' }); }
  }

  async inadimplencia(req, res) {
    const validacao = periodoSchema.safeParse(req.query);
    if (!validacao.success) return res.status(400).json({ erro: 'Filtros de inadimplência inválidos.' });
    const params = [req.usuarioLogado.empresa_id];
    const where = ["os.empresa_id=$1", "os.status='FINALIZADA'", 'os.deleted_at IS NULL', ...periodo(validacao.data, 'os.finalizado_em', params)];
    try {
      const resultado = await db.query(`SELECT os.id,c.nome AS cliente,c.telefone,os.finalizado_em,os.valor_total,
        COALESCE(p.total_pago,0) AS total_pago,GREATEST(os.valor_total-COALESCE(p.total_pago,0),0) AS saldo_pendente,
        GREATEST(CURRENT_DATE-os.finalizado_em::date,0)::int AS dias_em_aberto
        FROM ordens_servico os JOIN clientes c ON c.id=os.cliente_id
        LEFT JOIN (SELECT os_id,SUM(valor) total_pago FROM pagamentos GROUP BY os_id) p ON p.os_id=os.id
        WHERE ${where.join(' AND ')} AND os.valor_total>COALESCE(p.total_pago,0)
        ORDER BY dias_em_aberto DESC,os.finalizado_em`, params);
      const itens = resultado.rows;
      return res.json({
        resumo: { clientes: new Set(itens.map((item) => item.cliente)).size, ordens: itens.length, total_pendente: itens.reduce((soma, item) => soma + Number(item.saldo_pendente), 0) },
        itens,
      });
    } catch (_error) { return res.status(500).json({ erro: 'Falha ao carregar inadimplência.' }); }
  }
}

module.exports = new RelatorioController();
module.exports._csv = csv;
