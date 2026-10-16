const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../config/database');
const { padroes } = require('../middlewares/permissaoMiddleware');

const loginSchema = z.object({
  email: z.string().trim().email().max(150),
  senha: z.string().min(6).max(200),
}).strict();
const senhaSchema = z.object({
  senha_atual: z.string().min(6).max(200),
  nova_senha: z.string().min(8).max(100).regex(/[A-Za-z]/, 'Inclua pelo menos uma letra.').regex(/[0-9]/, 'Inclua pelo menos um número.'),
}).strict().refine((dados) => dados.senha_atual !== dados.nova_senha, { message:'A nova senha deve ser diferente da atual.', path:['nova_senha'] });

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
      const overrides = await db.query('SELECT permissao,permitido FROM usuario_permissoes WHERE usuario_id=$1', [usuario.id]);
      const base = new Set(padroes[usuario.perfil] || []);
      for (const item of overrides.rows) item.permitido ? base.add(item.permissao) : base.delete(item.permissao);
      const permissoes = [...base];
      const token = jwt.sign({ usuario_id: usuario.id, empresa_id: usuario.empresa_id, perfil: usuario.perfil, permissoes },
        process.env.JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256' });
      return res.json({
        mensagem: 'Login realizado com sucesso.',
        usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, empresa_id: usuario.empresa_id, permissoes },
        token,
      });
    } catch (error) {
      console.error('Erro no login:', error.message);
      return res.status(500).json({ erro: 'Falha interna ao autenticar.' });
    }
  }

  async alterarSenha(req, res) {
    const entrada = senhaSchema.safeParse(req.body);
    if (!entrada.success) return res.status(400).json({ erro: entrada.error.issues[0]?.message || 'Senha inválida.' });
    try {
      const result = await db.query(
        'SELECT senha_hash FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL',
        [req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id]
      );
      if (!result.rows[0] || !await bcrypt.compare(entrada.data.senha_atual, result.rows[0].senha_hash)) return res.status(401).json({ erro:'A senha atual está incorreta.' });
      const hash = await bcrypt.hash(entrada.data.nova_senha, 12);
      await db.query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2 AND empresa_id=$3', [hash, req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id]);
      return res.json({ mensagem:'Senha alterada. Entre novamente com a nova senha.' });
    } catch (error) { return res.status(500).json({ erro:'Falha ao alterar senha.' }); }
  }
}

module.exports = new AuthController();
