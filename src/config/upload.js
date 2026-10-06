const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const uploadDirectory = path.resolve(__dirname, '..', '..', 'tmp', 'uploads');

module.exports = {
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      const extension = file.mimetype === 'image/png' ? '.png' : '.jpg';
      callback(null, `${crypto.randomBytes(16).toString('hex')}${extension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    const accepted = ['image/png', 'image/jpeg'].includes(file.mimetype);
    callback(accepted ? null : new Error('Formato não suportado. Envie JPG ou PNG.'), accepted);
  },
};
