const crypto = require('crypto');
const { z } = require('zod');
const db = require('../config/database');
const logger = require('../config/logger');
const { permissoesEfetivas } = require('../middlewares/permissaoMiddleware');
const criarSchema = z.object({
  tipo: z.enum(['ACESSO', 'CORRECAO', 'EXCLUSAO', 'INFORMACAO', 'OPOSICAO']),
  descricao: z.string().trim().min(10).max(2000),
  cliente_id: z.number().int().positive().max(2147483647).optional(),
}).strict();
const atualizarSchema = z.object({ status: z.enum(['EM_ANALISE', 'CONCLUIDA']), resposta: z.string().trim().min(10).max(4000) }).strict();
const listaSchema = z.object({
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
  status: z.enum(['RECEBIDA', 'EM_ANALISE', 'CONCLUIDA']).optional(),
  tipo: criarSchema.shape.tipo.optional(),
  protocolo: z.string().uuid().optional(),
}).strict();
const historicoSchema = z.object({ cursor: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0) }).strict();
function pode(u, permissao) { const ps = permissoesEfetivas(u); return ps.includes('*') || ps.includes(permissao); }
function gerencia(u) { return ['GESTOR', 'ADMIN'].includes(u.perfil) && pode(u, 'GESTAO_GERENCIAR'); }
function falhar(res, error) {
  if (error.status) return res.status(error.status).json({ erro: error.message });
  logger.erro('privacidade.solicitacao', { erro_codigo: error.code || 'REQUEST_ERROR' });
  return res.status(500).json({ erro: 'Falha ao processar solicitação de privacidade.' });
}
class PrivacidadeController {
  async criar(req, res) {
    const entrada = criarSchema.safeParse(req.body);
    if (!entrada.success) return res.status(400).json({ erro: 'Informe tipo válido e descrição de 10 a 2000 caracteres; não envie documentos ou senhas.' });
    const u = req.usuarioLogado;
    const chave = req.get?.('Idempotency-Key') || req.headers?.['idempotency-key'] || null;
    if (chave && !z.string().uuid().safeParse(chave).success) return res.status(400).json({ erro: 'Identificador de reenvio inválido.' });
    const { cliente_id, tipo, descricao } = entrada.data;
    if (cliente_id && (!gerencia(u) || !pode(u, 'CLIENTES_GERENCIAR'))) return res.status(403).json({ erro: 'Sem permissão para registrar solicitação de cliente.' });
    try {
      const id = crypto.randomUUID();
      const resultado = await db.transaction(async client => {
        const ativo = await client.query('SELECT id FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL FOR UPDATE', [u.usuario_id, u.empresa_id]);
        if (!ativo.rows.length) throw Object.assign(new Error('Conta inativa.'), { status: 401 });
        if (chave) {
          const anterior = (await client.query('SELECT id,tipo,descricao,cliente_id,status FROM privacidade_solicitacoes WHERE empresa_id=$1 AND solicitante_id=$2 AND client_uuid=$3', [u.empresa_id, u.usuario_id, chave])).rows[0];
          if (anterior) {
            if (anterior.tipo !== tipo || anterior.descricao !== descricao || (anterior.cliente_id || null) !== (cliente_id || null)) throw Object.assign(new Error('Identificador de reenvio já utilizado com outro pedido.'), { status: 409 });
            return { id: anterior.id, status: anterior.status, repetido: true };
          }
        }
        if (cliente_id && !(await client.query('SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL', [cliente_id, u.empresa_id])).rows.length) throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });
        const recentes = await client.query("SELECT COUNT(*)::int total FROM privacidade_solicitacoes WHERE solicitante_id=$1 AND empresa_id=$2 AND created_at>NOW()-INTERVAL '1 hour'", [u.usuario_id, u.empresa_id]);
        if (recentes.rows[0].total >= 10) throw Object.assign(new Error('Limite de solicitações atingido. Aguarde uma hora.'), { status: 429 });
        await client.query('INSERT INTO privacidade_solicitacoes(id,empresa_id,solicitante_id,cliente_id,tipo,descricao,client_uuid) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, u.empresa_id, u.usuario_id, cliente_id || null, tipo, descricao, chave]);
        await client.query("INSERT INTO privacidade_historico(solicitacao_id,usuario_id,status) VALUES($1,$2,'RECEBIDA')", [id, u.usuario_id]);
        return { id, status: 'RECEBIDA', repetido: false };
      });
      return res.status(resultado.repetido ? 200 : 201).json({ protocolo: resultado.id, status: resultado.status, ja_registrada: resultado.repetido, mensagem: 'Solicitação registrada. Guarde o protocolo para acompanhamento. O pedido será analisado pela empresa responsável.' });
    } catch (error) { return falhar(res, error); }
  }
  async listar(req, res) {
    const entrada = listaSchema.safeParse(req.query);
    if (!entrada.success) return res.status(400).json({ erro: 'Página ou filtros inválidos. Informe status/tipo válido e protocolo completo.' });
    const u = req.usuarioLogado, gestao = gerencia(u);
    try {
      const resultado = await db.query(`SELECT id AS protocolo,cliente_id,tipo,descricao,status,resposta,created_at,updated_at
        FROM privacidade_solicitacoes WHERE empresa_id=$1 AND ($2::boolean OR solicitante_id=$3)
        AND (cliente_id IS NULL OR $4::boolean)
        AND ($6::text IS NULL OR status=$6) AND ($7::text IS NULL OR tipo=$7)
        AND ($8::uuid IS NULL OR id=$8) ORDER BY created_at DESC,id LIMIT 51 OFFSET $5`,
      [u.empresa_id, gestao, u.usuario_id, gestao && pode(u, 'CLIENTES_GERENCIAR'), (entrada.data.pagina - 1) * 50,
        entrada.data.status || null, entrada.data.tipo || null, entrada.data.protocolo || null]);
      return res.json({ solicitacoes: resultado.rows.slice(0, 50), pagina: entrada.data.pagina, tem_mais: resultado.rows.length > 50, pode_gerenciar: gestao, pode_registrar_cliente: gestao && pode(u, 'CLIENTES_GERENCIAR') });
    } catch (error) { return falhar(res, error); }
  }
  async detalhes(req, res) {
    const entrada = historicoSchema.safeParse(req.query);
    if (!z.string().uuid().safeParse(req.params.id).success || !entrada.success) return res.status(400).json({ erro: 'Protocolo ou cursor inválido.' });
    const u = req.usuarioLogado, gestao = gerencia(u);
    try {
      const pedido = (await db.query(`SELECT id AS protocolo,cliente_id,tipo,descricao,status,resposta,created_at,updated_at
        FROM privacidade_solicitacoes WHERE id=$1 AND empresa_id=$2
        AND ($3::boolean OR solicitante_id=$4) AND (cliente_id IS NULL OR $5::boolean)`,
      [req.params.id, u.empresa_id, gestao, u.usuario_id, gestao && pode(u, 'CLIENTES_GERENCIAR')])).rows[0];
      if (!pedido) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
      const historico = (await db.query(`SELECT h.id::text AS id,h.status,h.resposta,h.created_at
        FROM privacidade_historico h JOIN privacidade_solicitacoes s ON s.id=h.solicitacao_id
        WHERE h.solicitacao_id=$1 AND s.empresa_id=$2 AND h.id>$3 ORDER BY h.id ASC LIMIT 51`,
      [req.params.id, u.empresa_id, entrada.data.cursor])).rows;
      const itens = historico.slice(0, 50), temMais = historico.length > 50;
      return res.json({ solicitacao: pedido, historico: itens, pode_gerenciar: gestao,
        paginacao: { tem_mais: temMais, proximo_cursor: temMais ? itens[itens.length - 1].id : null } });
    } catch (error) { return falhar(res, error); }
  }
  async atualizar(req, res) {
    const entrada = atualizarSchema.safeParse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success || !entrada.success) return res.status(400).json({ erro: 'Informe protocolo válido, status e resposta de 10 a 4000 caracteres.' });
    const u = req.usuarioLogado;
    if (!gerencia(u)) return res.status(403).json({ erro: 'Sem permissão para analisar solicitações.' });
    try {
      await db.transaction(async client => {
        const pedido = (await client.query('SELECT cliente_id,status FROM privacidade_solicitacoes WHERE id=$1 AND empresa_id=$2 FOR UPDATE', [req.params.id, u.empresa_id])).rows[0];
        if (!pedido) throw Object.assign(new Error('Solicitação não encontrada.'), { status: 404 });
        if (pedido.cliente_id && !pode(u, 'CLIENTES_GERENCIAR')) throw Object.assign(new Error('Sem permissão para analisar dados de cliente.'), { status: 403 });
        if (pedido.status === 'CONCLUIDA') throw Object.assign(new Error('Solicitação já concluída; registre novo protocolo para revisão.'), { status: 409 });
        if (pedido.status === 'RECEBIDA' && entrada.data.status === 'CONCLUIDA') throw Object.assign(new Error('Inicie a análise antes de concluir a solicitação.'), { status: 409 });
        await client.query('UPDATE privacidade_solicitacoes SET status=$1,resposta=$2,responsavel_id=$3,updated_at=NOW() WHERE id=$4 AND empresa_id=$5', [entrada.data.status, entrada.data.resposta, u.usuario_id, req.params.id, u.empresa_id]);
        await client.query('INSERT INTO privacidade_historico(solicitacao_id,usuario_id,status,resposta) VALUES($1,$2,$3,$4)', [req.params.id, u.usuario_id, entrada.data.status, entrada.data.resposta]);
      });
      return res.json({ protocolo: req.params.id, status: entrada.data.status });
    } catch (error) { return falhar(res, error); }
  }
}
module.exports = new PrivacidadeController();
