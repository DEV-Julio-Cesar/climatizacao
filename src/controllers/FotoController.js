const crypto = require('crypto');
const db = require('../config/database');
const OsModel = require('../models/OsModel');
const { validarMagicBytes } = require('../config/upload');
const logger = require('../config/logger');
const ObjectStorage = require('../services/ObjectStorageService');
const ArquivoUrlService = require('../services/ArquivoUrlService');

const TIPOS = ['ANTES', 'DEPOIS', 'ASSINATURA', 'EVIDENCIA'];

class FotoController {
  async upload(req, res) {
    if (!req.file) return res.status(400).json({ erro: 'Imagem não enviada.' });

    // Validação de magic bytes: garante que o conteúdo real bate com o MIME declarado
    if (!validarMagicBytes(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ erro: 'O arquivo enviado não corresponde ao formato declarado.' });
    }
      const osId = Number(req.body.os_id);
      const tipo = req.body.tipo;
      const comentario = String(req.body.comentario || '').trim().slice(0, 500) || null;
      const latitude = req.body.latitude === undefined || req.body.latitude === '' ? null : Number(req.body.latitude);
      const longitude = req.body.longitude === undefined || req.body.longitude === '' ? null : Number(req.body.longitude);
      const clientUuid = String(req.body.client_uuid || '').trim().slice(0, 80) || null;

      // Bug 13 — validar capturada_em antes de passar ao banco como timestamptz.
      // Uma string malformada causaria erro 500 no COALESCE($7::timestamptz,NOW()).
      const capturadaEmRaw = req.body.capturada_em || null;
      if (capturadaEmRaw !== null && Number.isNaN(Date.parse(capturadaEmRaw))) {
        return res.status(400).json({ erro: 'Data de captura inválida.' });
      }
      const capturadaEm = capturadaEmRaw;
      try {
      if (!Number.isInteger(osId) || !TIPOS.includes(tipo) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
        return res.status(400).json({ erro: 'os_id ou tipo de foto inválido.' });
      }
      const os = await OsModel.buscarPorId(osId, req.usuarioLogado.empresa_id);
      if (!os || (!['GESTOR', 'ADMIN'].includes(req.usuarioLogado.perfil) && os.tecnico_id !== req.usuarioLogado.usuario_id)) {
        return res.status(403).json({ erro: 'Acesso negado a esta O.S.' });
      }
      if (os.status !== 'EM_ANDAMENTO') {
        return res.status(409).json({ erro: 'Faça o check-in antes de registrar fotos.' });
      }
      if (tipo === 'DEPOIS') {
        const fotoAntes = await db.query("SELECT id FROM os_fotos WHERE os_id=$1 AND tipo='ANTES' LIMIT 1", [osId]);
        if (!fotoAntes.rows[0]) return res.status(422).json({ erro: 'Registre primeiro a foto de antes do serviço.' });
      }
      if (tipo === 'ASSINATURA') {
        const fotoDepois = await db.query("SELECT id FROM os_fotos WHERE os_id=$1 AND tipo='DEPOIS' LIMIT 1", [osId]);
        if (!fotoDepois.rows[0]) return res.status(422).json({ erro: 'Registre a foto final antes da assinatura.' });
      }
      const baseUrl = process.env.APP_URL || (process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `${req.protocol}://${req.get('host')}`);
      if (clientUuid) {
        const existente = await db.query('SELECT id,tipo,url,comentario,latitude,longitude,capturada_em,checksum_sha256,tamanho_bytes FROM os_fotos WHERE empresa_id=$1 AND client_uuid=$2', [req.usuarioLogado.empresa_id, clientUuid]);
        if (existente.rows[0]) return res.status(200).json({ mensagem: 'Foto já sincronizada.', foto: existente.rows[0] });
      }
      const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const storageKey = crypto.randomUUID();
      const objectKey = `empresas/${req.usuarioLogado.empresa_id}/fotos/${storageKey}`;
      const externo = await ObjectStorage.salvar(objectKey, req.file.buffer, req.file.mimetype);
      const url = `${baseUrl}/arquivos/fotos/${storageKey}`;
      let result;
      try { result = await db.query(
        `INSERT INTO os_fotos (empresa_id,os_id,tipo,url,comentario,latitude,longitude,capturada_em,client_uuid,storage_key,mime_type,conteudo,criado_por,nome_original,tamanho_bytes,checksum_sha256)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,NOW()),$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id,tipo,url,comentario,latitude,longitude,capturada_em,checksum_sha256,tamanho_bytes`,
        [req.usuarioLogado.empresa_id, osId, tipo, url, comentario, latitude, longitude, capturadaEm, clientUuid, storageKey, req.file.mimetype, externo ? null : req.file.buffer, req.usuarioLogado.usuario_id, String(req.file.originalname || '').slice(0, 255) || null, req.file.size, checksum]
      ); } catch (error) { if (externo) await ObjectStorage.remover(objectKey).catch(() => {}); throw error; }
      return res.status(201).json({ mensagem: 'Upload realizado.', foto: { ...result.rows[0], url: ArquivoUrlService.assinarFoto(url, storageKey) } });
    } catch (error) {
      logger.erro('foto.upload', { request_id: req.id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao processar o upload.' });
    }
  }

  async remover(req, res) {
    const id = Number(req.params.id);
    try {
      const foto = await db.query(`SELECT f.*,os.tecnico_id,os.status FROM os_fotos f JOIN ordens_servico os ON os.id=f.os_id WHERE f.id=$1 AND f.empresa_id=$2 AND os.empresa_id=$2`, [id, req.usuarioLogado.empresa_id]);
      const item = foto.rows[0];
      if (!item || item.empresa_id !== req.usuarioLogado.empresa_id) return res.status(404).json({ erro: 'Foto não encontrada.' });
      if (!['GESTOR','ADMIN'].includes(req.usuarioLogado.perfil) && item.tecnico_id !== req.usuarioLogado.usuario_id) return res.status(403).json({ erro: 'Acesso negado.' });
      if (item.status === 'FINALIZADA') return res.status(409).json({ erro: 'Fotos de O.S. finalizada não podem ser excluídas.' });
      await db.query('DELETE FROM os_fotos WHERE id=$1 AND empresa_id=$2', [id, req.usuarioLogado.empresa_id]);
      if (item.storage_key && !item.conteudo) {
        const chave = `empresas/${item.empresa_id}/fotos/${item.storage_key}`;
        await ObjectStorage.remover(chave).catch((error) => logger.erro('foto.remover_objeto', { foto_id:id, erro_mensagem:error.message }));
      }
      return res.sendStatus(204);
    } catch (error) { return res.status(500).json({ erro: 'Falha ao remover foto.' }); }
  }
}

module.exports = new FotoController();
