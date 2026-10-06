const fs = require('fs/promises');
const db = require('../config/database');
const OsModel = require('../models/OsModel');

const TIPOS = ['ANTES', 'DEPOIS', 'ASSINATURA'];

class FotoController {
  async upload(req, res) {
    if (!req.file) return res.status(400).json({ erro: 'Imagem não enviada.' });
    const osId = Number(req.body.os_id);
    const tipo = req.body.tipo;
    try {
      if (!Number.isInteger(osId) || !TIPOS.includes(tipo)) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ erro: 'os_id ou tipo de foto inválido.' });
      }
      const os = await OsModel.buscarPorId(osId, req.usuarioLogado.empresa_id);
      if (!os || (!['GESTOR', 'ADMIN'].includes(req.usuarioLogado.perfil) && os.tecnico_id !== req.usuarioLogado.usuario_id)) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(403).json({ erro: 'Acesso negado a esta O.S.' });
      }
      const baseUrl = process.env.APP_URL || (process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `${req.protocol}://${req.get('host')}`);
      const url = `${baseUrl}/uploads/${req.file.filename}`;
      const result = await db.query(
        'INSERT INTO os_fotos (os_id, tipo, url) VALUES ($1, $2, $3) RETURNING id, tipo, url',
        [osId, tipo, url]
      );
      return res.status(201).json({ mensagem: 'Upload realizado.', foto: result.rows[0] });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {});
      console.error('Erro no upload:', error.message);
      return res.status(500).json({ erro: 'Falha ao processar o upload.' });
    }
  }
}

module.exports = new FotoController();
