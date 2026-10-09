const fs = require('fs/promises');
const db = require('../config/database');
const OsModel = require('../models/OsModel');

const TIPOS = ['ANTES', 'DEPOIS', 'ASSINATURA', 'EVIDENCIA'];

class FotoController {
  async upload(req, res) {
    if (!req.file) return res.status(400).json({ erro: 'Imagem não enviada.' });
      const osId = Number(req.body.os_id);
      const tipo = req.body.tipo;
      const comentario = String(req.body.comentario || '').trim().slice(0, 500) || null;
      const latitude = req.body.latitude === undefined || req.body.latitude === '' ? null : Number(req.body.latitude);
      const longitude = req.body.longitude === undefined || req.body.longitude === '' ? null : Number(req.body.longitude);
      const clientUuid = String(req.body.client_uuid || '').trim().slice(0, 80) || null;
      try {
      if (!Number.isInteger(osId) || !TIPOS.includes(tipo) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ erro: 'os_id ou tipo de foto inválido.' });
      }
      const os = await OsModel.buscarPorId(osId, req.usuarioLogado.empresa_id);
      if (!os || (!['GESTOR', 'ADMIN'].includes(req.usuarioLogado.perfil) && os.tecnico_id !== req.usuarioLogado.usuario_id)) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(403).json({ erro: 'Acesso negado a esta O.S.' });
      }
      if (os.status !== 'EM_ANDAMENTO') {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(409).json({ erro: 'Faça o check-in antes de registrar fotos.' });
      }
      if (tipo === 'DEPOIS') {
        const fotoAntes = await db.query("SELECT id FROM os_fotos WHERE os_id=$1 AND tipo='ANTES' LIMIT 1", [osId]);
        if (!fotoAntes.rows[0]) { await fs.unlink(req.file.path).catch(() => {}); return res.status(422).json({ erro: 'Registre primeiro a foto de antes do serviço.' }); }
      }
      if (tipo === 'ASSINATURA') {
        const fotoDepois = await db.query("SELECT id FROM os_fotos WHERE os_id=$1 AND tipo='DEPOIS' LIMIT 1", [osId]);
        if (!fotoDepois.rows[0]) { await fs.unlink(req.file.path).catch(() => {}); return res.status(422).json({ erro: 'Registre a foto final antes da assinatura.' }); }
      }
      const baseUrl = process.env.APP_URL || (process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `${req.protocol}://${req.get('host')}`);
      const url = `${baseUrl}/uploads/${req.file.filename}`;
      if (clientUuid) {
        const existente = await db.query('SELECT id,tipo,url,comentario,latitude,longitude,capturada_em FROM os_fotos WHERE client_uuid=$1', [clientUuid]);
        if (existente.rows[0]) { await fs.unlink(req.file.path).catch(() => {}); return res.status(200).json({ mensagem: 'Foto já sincronizada.', foto: existente.rows[0] }); }
      }
      const result = await db.query(
        `INSERT INTO os_fotos (os_id,tipo,url,comentario,latitude,longitude,capturada_em,client_uuid)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,NOW()),$8)
         RETURNING id,tipo,url,comentario,latitude,longitude,capturada_em`,
        [osId, tipo, url, comentario, latitude, longitude, req.body.capturada_em || null, clientUuid]
      );
      return res.status(201).json({ mensagem: 'Upload realizado.', foto: result.rows[0] });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {});
      console.error('Erro no upload:', error.message);
      return res.status(500).json({ erro: 'Falha ao processar o upload.' });
    }
  }

  async remover(req, res) {
    const id = Number(req.params.id);
    try {
      const foto = await db.query(`SELECT f.*,os.empresa_id,os.tecnico_id,os.status FROM os_fotos f JOIN ordens_servico os ON os.id=f.os_id WHERE f.id=$1`, [id]);
      const item = foto.rows[0];
      if (!item || item.empresa_id !== req.usuarioLogado.empresa_id) return res.status(404).json({ erro: 'Foto não encontrada.' });
      if (!['GESTOR','ADMIN'].includes(req.usuarioLogado.perfil) && item.tecnico_id !== req.usuarioLogado.usuario_id) return res.status(403).json({ erro: 'Acesso negado.' });
      if (item.status === 'FINALIZADA') return res.status(409).json({ erro: 'Fotos de O.S. finalizada não podem ser excluídas.' });
      await db.query('DELETE FROM os_fotos WHERE id=$1', [id]);
      const nome = item.url.split('/uploads/')[1];
      if (nome) await fs.unlink(require('path').join(__dirname, '../../uploads', nome)).catch(() => {});
      return res.sendStatus(204);
    } catch (error) { return res.status(500).json({ erro: 'Falha ao remover foto.' }); }
  }
}

module.exports = new FotoController();
