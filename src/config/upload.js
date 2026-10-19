const multer = require('multer');
module.exports = {
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  // O disco do Render é efêmero. O buffer é persistido no PostgreSQL pelo
  // FotoController para que evidências e assinaturas sobrevivam aos deploys.
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    const accepted = ['image/png', 'image/jpeg'].includes(file.mimetype);
    callback(accepted ? null : new Error('Formato não suportado. Envie JPG ou PNG.'), accepted);
  },
};
