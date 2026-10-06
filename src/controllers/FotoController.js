const db = require('../config/database');

class FotoController {
  
  async upload(req, res) {
    try {
      // O req.file é preenchido pelo multer magicamente antes de chegar aqui
      const { os_id, tipo_foto } = req.body;
      const { filename } = req.file; 

      // Constrói a URL pública da imagem (A API precisa estar servindo arquivos estáticos)
      const url_foto = `${process.env.APP_URL}/uploads/${filename}`;

      // Salva no banco de dados (na tabela os_fotos que criamos lá atrás)
      const query = `
        INSERT INTO os_fotos (os_id, tipo_foto, url_foto)
        VALUES ($1, $2, $3)
        RETURNING id, url_foto;
      `;
      const resultado = await db.query(query, [os_id, tipo_foto, url_foto]);

      return res.status(201).json({
        mensagem: 'Upload realizado com sucesso.',
        foto: resultado.rows[0]
      });

    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ erro: 'Falha ao processar o upload da imagem.' });
    }
  }
}

module.exports = new FotoController();