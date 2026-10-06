const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../config/database');

const loginSchema = z.object({
  email: z.string().trim().email().max(150),
  senha: z.string().min(6).max(200),
}).strict();

class AuthController {
  async login(req, res) {
    const entrada = loginSchema.safeParse(req.body);
    if (!entrada.success) return res.status(400).json({ erro: 'E-mail ou senha inválidos.' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ erro: 'Autenticação não configurada no servidor.' });
    try {
      const result = await db.query(
        `SELECT id, empresa_id, nome, senha_hash, perfil FROM usuarios
         WHERE LOWER(email) = LOWER($1) AND ativo = TRUE AND deleted_at IS NULL`,
        [entrada.data.email]
      );
      const usuario = result.rows[0];
      const senhaValida = usuario && await bcrypt.compare(entrada.data.senha, usuario.senha_hash);
      if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas.' });
      const token = jwt.sign({ usuario_id: usuario.id, empresa_id: usuario.empresa_id, perfil: usuario.perfil },
        process.env.JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256' });
      return res.json({
        mensagem: 'Login realizado com sucesso.',
        usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, empresa_id: usuario.empresa_id },
        token,
      });
    } catch (error) {
      console.error('Erro no login:', error.message);
      return res.status(500).json({ erro: 'Falha interna ao autenticar.' });
    }
  }
}

module.exports = new AuthController();
