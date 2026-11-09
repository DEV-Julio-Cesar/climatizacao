const db = require('../../config/database');
const WhatsAppService = require('../../services/WhatsAppService');

class OsComunicacaoController {
  async enviarLembrete(req, res) {
    try {
      const resultado = await db.query(`SELECT os.id,os.status,os.agendado_para,c.nome cliente_nome,c.telefone cliente_telefone,
        u.nome tecnico_nome FROM ordens_servico os JOIN clientes c ON c.id=os.cliente_id
        JOIN usuarios u ON u.id=os.tecnico_id WHERE os.id=$1 AND os.empresa_id=$2 AND os.deleted_at IS NULL`,
      [req.params.id, req.usuarioLogado.empresa_id]);
      const os = resultado.rows[0];
      if (!os) return res.status(404).json({ erro: 'O.S. não encontrada.' });
      if (['FINALIZADA', 'CANCELADA'].includes(os.status)) return res.status(409).json({ erro: 'Esta O.S. não aceita lembrete.' });
      if (!os.agendado_para) return res.status(409).json({ erro: 'Agende a visita antes de enviar o lembrete.' });
      if (!os.cliente_telefone) return res.status(400).json({ erro: 'Cliente sem telefone cadastrado.' });
      if (!WhatsAppService.configurado()) return res.status(503).json({ erro: 'Integração do WhatsApp não configurada.' });
      const enviado = await WhatsAppService.enviarLembreteAgendamento(os.cliente_telefone, {
        cliente: os.cliente_nome, agendamento: os.agendado_para, tecnico: os.tecnico_nome, ordem: os.id,
      },req.usuarioLogado.empresa_id);
      return res.json({ mensagem: 'Lembrete enviado pelo WhatsApp.', mensagem_id: enviado?.messages?.[0]?.id || null });
    } catch (error) { return res.status(502).json({ erro: error.message || 'Falha ao enviar lembrete.' }); }
  }
}

module.exports = new OsComunicacaoController();
