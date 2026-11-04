const crypto = require('crypto');
const db = require('../config/database');
const OsModel = require('../models/OsModel');
const PdfService = require('./PdfService');
const logger = require('../config/logger');

async function gerarDocumento(id, usuario) {
  try {
    const dados = await OsModel.buscarDadosCompletosParaPdf(id, usuario.empresa_id);
    const [fotos, checklist, medicoes, itens] = await Promise.all([
      db.query(
        `SELECT tipo,url,comentario,latitude,longitude,capturada_em,conteudo,mime_type,assinante_nome
           FROM os_fotos f
           JOIN ordens_servico os ON os.id = f.os_id
          WHERE f.os_id = $1 AND os.empresa_id = $2
          ORDER BY f.created_at`,
        [id, usuario.empresa_id],
      ),
      db.query(
        'SELECT item,conforme,observacao FROM os_checklist_respostas WHERE os_id=$1 ORDER BY id',
        [id],
      ),
      db.query('SELECT * FROM os_medicoes WHERE os_id=$1', [id]),
      db.query(
        'SELECT tipo,descricao,quantidade,valor_unitario FROM os_itens WHERE os_id=$1 ORDER BY id',
        [id],
      ),
    ]);

    dados.checklist = checklist.rows;
    dados.medicoes = medicoes.rows[0] || {};
    dados.itens = itens.rows;

    const pdfConteudo = dados.pdf_conteudo || await PdfService.gerarOsPdf(dados, fotos.rows);
    const pdfStorageKey = dados.pdf_storage_key || crypto.randomUUID();
    const baseUrl =
      process.env.APP_URL ||
      (process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
        : 'http://localhost:3000');
    const pdfUrl = `${baseUrl}/arquivos/ordens/${pdfStorageKey}.pdf`;

    await db.query(
      'UPDATE ordens_servico SET pdf_url=$1,pdf_storage_key=$2,pdf_conteudo=$3 WHERE id=$4 AND empresa_id=$5',
      [pdfUrl, pdfStorageKey, pdfConteudo, id, usuario.empresa_id],
    );

    const canal = dados.telefone_whatsapp ? await require('./WhatsAppContaService').paraEmpresa(usuario.empresa_id, false) : null;
    if (canal) {
      await canal.enviarPdfOs(dados.telefone_whatsapp, dados.cliente_nome, require('./ArquivoService').assinarUrl(pdfUrl, usuario.empresa_id, '7d'));
    }

    return pdfUrl;
  } catch (pdfError) {
    // A fila persistente reagenda a tarefa quando a geração ou envio falha.
    logger.aviso('os.pdf.falha', { os_id: id, erro_mensagem: pdfError.message });
    throw pdfError;
  }
}

module.exports = { gerarDocumento };
