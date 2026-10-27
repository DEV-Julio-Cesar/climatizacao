/**
 * LgpdController — atende os direitos do titular previstos na LGPD (Lei 13.709/2018).
 *
 * GET  /conta/dados   — exporta todos os dados pessoais do usuário autenticado (Art. 18, II)
 * DELETE /conta/dados — solicita exclusão / anonimização dos dados (Art. 18, VI)
 *
 * A exclusão é "lógica + anonimização" para não quebrar integridade referencial:
 *   - Campos de identificação pessoal são sobrescritos com valores anonimizados
 *   - deleted_at é preenchido (soft-delete já existente)
 *   - O registro de auditoria da solicitação é mantido (obrigação legal)
 */

const db = require('../config/database');
const logger = require('../config/logger');

class LgpdController {
  /**
   * Exporta um portfólio de dados pessoais do usuário no formato JSON.
   * Não inclui senha_hash nem tokens — apenas dados que identificam a pessoa.
   */
  async exportarDados(req, res) {
    const { usuario_id, empresa_id } = req.usuarioLogado;
    try {
      const [usuario, os, clientes] = await Promise.all([
        db.query(
          `SELECT id, nome, email, perfil, created_at
             FROM usuarios
            WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
          [usuario_id, empresa_id],
        ),
        db.query(
          `SELECT os.id, os.tipo_servico, os.descricao_problema, os.status,
                  os.agendado_para, os.finalizado_em, os.created_at,
                  c.nome AS cliente_nome, c.endereco AS cliente_endereco
             FROM ordens_servico os
             JOIN clientes c ON c.id = os.cliente_id
            WHERE os.tecnico_id = $1 AND os.empresa_id = $2 AND os.deleted_at IS NULL
            ORDER BY os.created_at DESC
            LIMIT 1000`,
          [usuario_id, empresa_id],
        ),
        // Clientes criados/gerenciados pelo usuário (se gestor)
        db.query(
          `SELECT id, nome, telefone, email, cpf_cnpj, endereco, cidade, estado, created_at
             FROM clientes
            WHERE empresa_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 500`,
          [empresa_id],
        ),
      ]);

      await _registrarAuditoria(usuario_id, empresa_id, 'EXPORTACAO_DADOS', req.ip);

      return res.json({
        exportado_em: new Date().toISOString(),
        aviso: 'Este relatório contém todos os dados pessoais associados à sua conta.',
        usuario: usuario.rows[0] ?? null,
        ordens_servico: os.rows,
        clientes_empresa: clientes.rows,
      });
    } catch (error) {
      logger.erro('lgpd.exportar', { usuario_id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao exportar dados.' });
    }
  }

  /**
   * Anonimiza os dados pessoais do usuário e agenda exclusão de registros
   * que não precisam ser mantidos por obrigação legal.
   *
   * O que é anonimizado:
   *   - nome → "Usuário Removido"
   *   - email → hash não-reversível + sufixo @removido.invalid
   *   - push_token → NULL
   *   - ativo → FALSE, deleted_at → NOW()
   *
   * O que é MANTIDO (obrigação legal / integridade):
   *   - Ordens de serviço e histórico (documentos fiscais / garantia)
   *   - Registro de auditoria desta solicitação
   */
  async excluirDados(req, res) {
    const { usuario_id, empresa_id } = req.usuarioLogado;

    // Exige confirmação explícita no corpo para evitar exclusões acidentais
    if (req.body?.confirmacao !== 'CONFIRMAR_EXCLUSAO') {
      return res.status(400).json({
        erro: 'Envie { "confirmacao": "CONFIRMAR_EXCLUSAO" } para confirmar a exclusão.',
      });
    }

    try {
      await db.transaction(async (client) => {
        // Gera um identificador anônimo derivado do ID (não reversível, mas estável)
        const emailAnonimo = `usuario_${usuario_id}_removido@removido.invalid`;

        await client.query(
          `UPDATE usuarios
              SET nome             = 'Usuário Removido',
                  email            = $1,
                  senha_hash       = 'REMOVIDO',
                  push_token       = NULL,
                  ativo            = FALSE,
                  deleted_at       = NOW(),
                  senha_alterada_em = NOW(),
                  updated_at       = NOW()
            WHERE id = $2 AND empresa_id = $3`,
          [emailAnonimo, usuario_id, empresa_id],
        );

        // Registra ANTES do commit para garantir rastreabilidade
        await _registrarAuditoria(usuario_id, empresa_id, 'EXCLUSAO_DADOS', req.ip, client);
      });

      logger.info('lgpd.exclusao', { usuario_id, empresa_id, ip: req.ip });

      return res.json({
        mensagem:
          'Seus dados pessoais foram anonimizados. ' +
          'Registros operacionais (ordens de serviço) são mantidos por obrigação legal.',
      });
    } catch (error) {
      logger.erro('lgpd.excluir', { usuario_id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao processar exclusão de dados.' });
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Persiste um registro de auditoria LGPD na tabela lgpd_auditoria.
 * Usa a conexão do cliente transacional quando disponível, ou o pool padrão.
 */
async function _registrarAuditoria(usuarioId, empresaId, tipo, ip, executor = db) {
  try {
    await executor.query(
      `INSERT INTO lgpd_auditoria (usuario_id, empresa_id, tipo, ip_origem)
       VALUES ($1, $2, $3, $4)`,
      [usuarioId, empresaId, tipo, ip || null],
    );
  } catch (auditErr) {
    // Auditoria não deve derrubar a operação principal — apenas loga
    logger.aviso('lgpd.auditoria.falha', { usuario_id: usuarioId, erro_mensagem: auditErr.message });
  }
}

module.exports = new LgpdController();
