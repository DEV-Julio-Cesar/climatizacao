const multer = require('multer');

// Tamanho máximo permitido por arquivo
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

// Tipos MIME aceitos e respectivos magic bytes (assinatura binária)
const TIPOS_ACEITOS = {
  'image/jpeg': [
    [0xff, 0xd8, 0xff],           // JPEG / JFIF / EXIF
  ],
  'image/png': [
    [0x89, 0x50, 0x4e, 0x47],    // PNG
  ],
};

/**
 * Valida os primeiros bytes do buffer contra as assinaturas conhecidas.
 * Impede que arquivos com mimetype forjado passem pela verificação.
 */
function validarMagicBytes(buffer, mimetype) {
  const assinaturas = TIPOS_ACEITOS[mimetype];
  if (!assinaturas) return false;
  return assinaturas.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte),
  );
}

module.exports = {
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
  // O disco do Render é efêmero. O buffer é persistido no PostgreSQL pelo
  // FotoController para que evidências e assinaturas sobrevivam aos deploys.
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    if (!TIPOS_ACEITOS[file.mimetype]) {
      return callback(
        new Error('Formato não suportado. Envie JPG ou PNG.'),
        false,
      );
    }
    callback(null, true);
  },
  // Exportado para ser chamado pelo FotoController após o buffer estar disponível
  validarMagicBytes,
};
