const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

module.exports = {
  // Salva os arquivos na pasta 'tmp/uploads' do servidor
  storage: multer.diskStorage({
    destination: path.resolve(__dirname, '..', '..', 'tmp', 'uploads'),
    filename: (req, file, cb) => {
      // Gera um hash aleatório para garantir que fotos com o mesmo nome não se sobrescrevam
      const hash = crypto.randomBytes(10).toString('hex');
      const filename = `${hash}-${file.originalname}`;
      cb(null, filename);
    }
  }),
  // Validação de segurança: aceita apenas imagens
  fileFilter: (req, file, cb) => {
    const isAccepted = ['image/png', 'image/jpeg', 'image/jpg'].includes(file.mimetype);
    if (isAccepted) {
      return cb(null, true);
    }
    return cb(new Error('Formato de arquivo não suportado. Envie JPG ou PNG.'));
  }
};