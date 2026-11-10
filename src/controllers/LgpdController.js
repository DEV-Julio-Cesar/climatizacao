const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../config/database');
const logger = require('../config/logger');

const paginaSchema = z.object({
  cursor: z.coerce.number().int().min(0).max(2147483647).default(0),
  limite: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const exclusaoSchema = z.object({
  confirmacao: z.literal('CONFIRMAR_EXCLUSAO'),
  senha_atual: z.string().min(6).max(200),
}).strict();

async function auditar(executor, usuario, tipo, ip) {
  // Não declarar sucesso se a gravação da auditoria falhar.
  await executor.query('INSERT INTO lgpd_auditoria (usuario_id,empresa_id,tipo,ip_origem) VALUES ($1,$2,$3,$4)',
    [usuario.usuario_id, usuario.empresa_id, tipo, ip || null]);
}

class LgpdController {
  async exportarDados(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    const entrada = paginaSchema.safeParse(req.query);
    if (!entrada.success) return res.status(400).json({ erro: 'Paginação inválida: cursor inteiro não negativo e limite entre 1 e 100.' });
    const { usuario_id, empresa_id } = req.usuarioLogado;
    const { cursor, limite } = entrada.data;
    try {
      const dados = await db.transaction(async client => {
        const usuario = await client.query('SELECT id,nome,email,perfil,created_at FROM usuarios WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL', [usuario_id, empresa_id]);
        // Relatório pessoal não inclui cadastro empresarial ou identificação de clientes.
        const ordens = await client.query(
          `SELECT id,tipo_servico,status,agendado_para,finalizado_em,created_at,
                  checkin_em,checkin_latitude,checkin_longitude,checkout_em,checkout_latitude,checkout_longitude
             FROM ordens_servico WHERE tecnico_id=$1 AND empresa_id=$2 AND id>$3
            ORDER BY id ASC LIMIT $4`, [usuario_id, empresa_id, cursor, limite + 1]);
        await auditar(client, req.usuarioLogado, 'EXPORTACAO_DADOS', req.ip);
        return { usuario: usuario.rows[0] || null, ordens: ordens.rows };
      });
      const mais = dados.ordens.length > limite;
      const ordens = dados.ordens.slice(0, limite);
      return res.json({
        exportado_em: new Date().toISOString(), escopo: 'RESUMO_DA_CONTA_E_ORDENS_ATRIBUIDAS',
        aviso: 'Resumo paginado da conta e das ordens atribuídas. Não é uma cópia integral de todos os dados pessoais. Para acesso completo, correção ou revisão de retenção, registre uma solicitação de privacidade.',
        usuario: dados.usuario, ordens_servico: ordens, clientes_empresa: [],
        paginacao: { limite, tem_mais: mais, proximo_cursor: mais ? ordens[ordens.length - 1].id : null },
      });
    } catch (error) {
      logger.erro('lgpd.exportar', { usuario_id, erro_codigo: error.code || 'EXPORT_ERROR' });
      return res.status(500).json({ erro: 'Falha ao exportar dados.' });
    }
  }

  async excluirDados(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    const entrada = exclusaoSchema.safeParse(req.body);
    if (!entrada.success) return res.status(400).json({ erro: 'Informe a senha atual e a confirmação CONFIRMAR_EXCLUSAO.' });
    const { usuario_id, empresa_id } = req.usuarioLogado;
    try {
      await db.transaction(async client => {
        // Mesmo lock do login e recuperação: não emitir sessão durante a remoção.
        const usuario = (await client.query('SELECT senha_hash FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL FOR UPDATE', [usuario_id, empresa_id])).rows[0];
        if (!usuario || !await bcrypt.compare(entrada.data.senha_atual, usuario.senha_hash)) throw Object.assign(new Error('Senha atual inválida.'), { status: 403 });
        await client.query(`UPDATE usuarios SET nome='Usuário Removido',email=$1,senha_hash='REMOVIDO',ativo=FALSE,deleted_at=NOW(),senha_alterada_em=NOW() WHERE id=$2 AND empresa_id=$3`, [`removido_${crypto.randomUUID()}@removido.invalid`, usuario_id, empresa_id]);
        await client.query('UPDATE sessoes SET revogada_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND revogada_em IS NULL', [usuario_id, empresa_id]);
        await client.query('DELETE FROM dispositivos_push WHERE usuario_id=$1 AND empresa_id=$2', [usuario_id, empresa_id]);
        await client.query('UPDATE recuperacoes_senha SET usado_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND usado_em IS NULL', [usuario_id, empresa_id]);
        await client.query("UPDATE emails_recuperacao SET concluido_em=NOW(),conteudo_cifrado='',bloqueado_ate=NULL WHERE id IN (SELECT id FROM recuperacoes_senha WHERE usuario_id=$1 AND empresa_id=$2)", [usuario_id, empresa_id]);
        await auditar(client, req.usuarioLogado, 'EXCLUSAO_DADOS', req.ip);
      });
      res.clearCookie('climasaas_refresh', { path: '/auth/refresh' });
      return res.json({
        mensagem: 'Conta desativada, identificadores de acesso substituídos e sessões revogadas. Registros vinculados, fotos, PDFs e cópias locais/backups não são eliminados por esta ação. Isso não constitui anonimização completa. Solicitações sobre esses registros devem ser acompanhadas com a empresa responsável.',
        escopo: 'DESATIVACAO_E_REMOCAO_DOS_IDENTIFICADORES_DE_ACESSO', anonimizacao_completa: false,
      });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ erro: error.message });
      logger.erro('lgpd.excluir', { usuario_id, erro_codigo: error.code || 'DELETE_ERROR' });
      return res.status(500).json({ erro: 'Falha ao processar exclusão de dados.' });
    }
  }
}
module.exports = new LgpdController();
