const db = require('../config/database');
class DocumentoController {
  async listar(req, res) {
    try {
      const resultado = await db.query(`SELECT f.os_id,f.tentativas,f.executar_em,f.bloqueado_ate,f.concluido_em,
        CASE WHEN f.ultimo_erro IS NOT NULL THEN 'Falha no processamento. A tarefa será tentada novamente.' ELSE NULL END ultimo_erro,
        c.nome cliente_nome FROM fila_documentos f JOIN ordens_servico os ON os.id=f.os_id AND os.empresa_id=f.empresa_id
        JOIN clientes c ON c.id=os.cliente_id AND c.empresa_id=os.empresa_id
        WHERE f.empresa_id=$1 AND os.deleted_at IS NULL ORDER BY f.concluido_em NULLS FIRST,f.executar_em DESC LIMIT 100`, [req.usuarioLogado.empresa_id]);
      return res.json(resultado.rows);
    } catch { return res.status(500).json({ erro: 'Falha ao carregar documentos.' }); }
  }
  async reprocessar(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'O.S. inválida.' });
    try {
      const resultado = await db.query(`UPDATE fila_documentos f SET concluido_em=NULL,ultimo_erro=NULL,executar_em=NOW(),bloqueado_ate=NULL
        WHERE f.os_id=$1 AND f.empresa_id=$2 AND (f.bloqueado_ate IS NULL OR f.bloqueado_ate<NOW())
          AND EXISTS(SELECT 1 FROM ordens_servico os WHERE os.id=f.os_id AND os.empresa_id=f.empresa_id AND os.status='FINALIZADA' AND os.deleted_at IS NULL)
        RETURNING os_id`, [id, req.usuarioLogado.empresa_id]);
      if (!resultado.rows.length) return res.status(409).json({ erro: 'Tarefa indisponível ou em processamento.' });
      return res.json({ mensagem: 'Documento enfileirado para geração e envio.' });
    } catch { return res.status(500).json({ erro: 'Falha ao reprocessar documento.' }); }
  }
}
module.exports = new DocumentoController();
