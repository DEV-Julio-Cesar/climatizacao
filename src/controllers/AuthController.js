const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// Chave secreta: no ambiente de produção, DEVE ficar no arquivo .env
const JWT_SECRET = process.env.JWT_SECRET || 'chave_super_secreta_clima';

class AuthController {
  
  async login(req, res) {
    const { email, senha } = req.body;

    try {
      // 1. Busca o usuário (e garante que ele não foi deletado/inativado)
      const query = `
        SELECT id, empresa_id, nome, senha_hash, perfil 
        FROM usuarios 
        WHERE email = $1 AND ativo = TRUE
      `;
      const resultado = await db.query(query, [email]);
      const usuario = resultado.rows[0];

      // 2. Valida se o usuário existe
      if (!usuario) {
        return res.status(401).json({ erro: 'Credenciais inválidas.' });
      }

      // 3. Compara a senha digitada com o hash do banco
      const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
      if (!senhaValida) {
        return res.status(401).json({ erro: 'Credenciais inválidas.' });
      }

      // 4. Cria o Payload do JWT (Os dados que viajam dentro do token)
      // NUNCA coloque senhas aqui, apenas IDs e permissões.
      const payload = {
        usuario_id: usuario.id,
        empresa_id: usuario.empresa_id,
        perfil: usuario.perfil // 'TECNICO' ou 'GESTOR'
      };

      // 5. Assina o token com expiração (ex: 8 horas para cobrir um turno de trabalho)
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

      // Retorna os dados básicos e o token para o App Mobile
      return res.status(200).json({
        mensagem: 'Login realizado com sucesso',
        usuario: { nome: usuario.nome, perfil: usuario.perfil },
        token
      });

    } catch (erro) {
      console.error('Erro no login:', erro);
      return res.status(500).json({ erro: 'Falha interna ao autenticar.' });
    }
  }
}

module.exports = new AuthController();