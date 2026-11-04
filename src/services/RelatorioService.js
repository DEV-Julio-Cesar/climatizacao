const { z } = require('zod');
const db = require('../config/database');
const tipos = ['LIMPEZA','INSTALACAO','REMOCAO','PREVENTIVA','PROBLEMA_TECNICO'];
function filtros(query = {}) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const inicio = new Date(`${hoje}T12:00:00Z`); inicio.setUTCDate(inicio.getUTCDate() - 89);
  const parsed = z.object({ inicio: z.string().date().default(inicio.toISOString().slice(0,10)), fim: z.string().date().default(hoje), tecnico_id: z.coerce.number().int().positive().optional(), tipo_servico: z.enum(tipos).optional() }).strict().safeParse(query);
  if (!parsed.success || parsed.data.inicio > parsed.data.fim) throw Object.assign(new Error('Filtros inválidos. Informe um período válido.'), { status: 400 });
  return parsed.data;
}
const escopo = "os.empresa_id=$1 AND os.deleted_at IS NULL AND ($4::int IS NULL OR os.tecnico_id=$4) AND ($5::text IS NULL OR os.tipo_servico=$5)";
const periodo = 'os.created_at >= $2::date AND os.created_at < ($3::date+1)';
const params = (empresa, f) => [empresa, f.inicio, f.fim, f.tecnico_id || null, f.tipo_servico || null];
async function gerencial(empresa, f) {
  const p = params(empresa, f), where = `${escopo} AND ${periodo}`;
  const [os, receita, servicos, tecnicos, contratos] = await Promise.all([
    db.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='FINALIZADA')::int finalizadas,COUNT(*) FILTER(WHERE status='CANCELADA')::int canceladas,
      COUNT(*) FILTER(WHERE status='EM_ANDAMENTO')::int em_andamento,COUNT(*) FILTER(WHERE status='ABERTA' AND agendado_para<NOW())::int atrasadas,
      COUNT(*) FILTER(WHERE pausado_em IS NOT NULL)::int pausadas,COUNT(*) FILTER(WHERE retorno_necessario)::int retornos,
      ROUND(AVG((EXTRACT(EPOCH FROM(finalizado_em-iniciado_em))-total_pausa_segundos)/3600) FILTER(WHERE finalizado_em IS NOT NULL)::numeric,1) tempo_medio_horas,
      ROUND(100.0*COUNT(*) FILTER(WHERE status='FINALIZADA' AND retorno_necessario=FALSE)/NULLIF(COUNT(*) FILTER(WHERE status='FINALIZADA'),0),1) primeira_resolucao_pct
      FROM ordens_servico os WHERE ${where}`, p),
    db.query(`SELECT COALESCE(SUM(valor_total) FILTER(WHERE status='FINALIZADA'),0) faturado,
      (SELECT COALESCE(SUM(pg.valor),0) FROM pagamentos pg JOIN ordens_servico os ON os.id=pg.os_id AND os.empresa_id=pg.empresa_id
        WHERE ${escopo} AND pg.pago_em>=$2::date AND pg.pago_em<($3::date+1)) recebido FROM ordens_servico os WHERE ${where}`, p),
    db.query(`SELECT tipo_servico,COUNT(*)::int total,COALESCE(SUM(valor_total),0) valor FROM ordens_servico os WHERE ${where} GROUP BY tipo_servico ORDER BY total DESC`, p),
    db.query(`SELECT u.id,u.nome,COUNT(*)::int atendimentos,COUNT(*) FILTER(WHERE os.status='FINALIZADA')::int finalizadas FROM ordens_servico os JOIN usuarios u ON u.id=os.tecnico_id AND u.empresa_id=os.empresa_id WHERE ${where} GROUP BY u.id ORDER BY finalizadas DESC`, p),
    db.query("SELECT COUNT(*) FILTER(WHERE status='ATIVO')::int ativos,COALESCE(SUM(valor_mensal) FILTER(WHERE status='ATIVO'),0) receita_recorrente FROM contratos WHERE empresa_id=$1", [empresa]),
  ]);
  return { periodo: f, periodo_dias: Math.round((Date.parse(f.fim)-Date.parse(f.inicio))/86400000)+1, ...os.rows[0], ...receita.rows[0], contratos: contratos.rows[0], servicos: servicos.rows, tecnicos: tecnicos.rows };
}
async function ordens(empresa, f, pendentes = false) {
  const resultado = await db.query(`SELECT os.id,c.nome cliente,os.tipo_servico,os.status,os.created_at,os.finalizado_em,os.valor_total,
    u.nome tecnico,COALESCE(pg.pago,0) total_pago,GREATEST(os.valor_total-COALESCE(pg.pago,0),0) saldo_pendente
    FROM ordens_servico os JOIN clientes c ON c.id=os.cliente_id AND c.empresa_id=os.empresa_id
    JOIN usuarios u ON u.id=os.tecnico_id AND u.empresa_id=os.empresa_id
    LEFT JOIN(SELECT os_id,empresa_id,SUM(valor) pago FROM pagamentos GROUP BY os_id,empresa_id) pg ON pg.os_id=os.id AND pg.empresa_id=os.empresa_id
    WHERE ${escopo} AND ${periodo} ${pendentes ? "AND os.status='FINALIZADA' AND os.valor_total>COALESCE(pg.pago,0)" : ''}
    ORDER BY os.created_at DESC,os.id DESC LIMIT 10001`, params(empresa, f));
  if (resultado.rows.length > 10000) throw Object.assign(new Error('Mais de 10 mil ordens. Reduza o período da consulta.'), { status: 413 });
  return resultado.rows;
}
function csv(rows) {
  const campos = ['id','cliente','tecnico','tipo_servico','status','created_at','finalizado_em','valor_total','total_pago','saldo_pendente'];
  const celula = valor => {
    let texto = valor instanceof Date ? valor.toISOString() : String(valor ?? '');
    if (typeof valor === 'string' && /^[\s]*[=+\-@]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replaceAll('"','""')}"`;
  };
  return '\uFEFF' + [campos.map(celula).join(';'), ...rows.map(row => campos.map(c => celula(row[c])).join(';'))].join('\r\n');
}
module.exports = { filtros, gerencial, ordens, csv };
