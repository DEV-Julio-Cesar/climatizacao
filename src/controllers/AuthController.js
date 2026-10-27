const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../config/database');
const logger = require('../config/logger');
const { padroes } = require('../middlewares/permissaoMiddleware');

const loginSchema = z.object({
  email: z.string().trim().email().max(150),
  senha: z.string().min(6).max(200),
}).strict();

const senhaSchema = z.object({
  senha_atual: z.string().min(6).max(200),
  nova_senha: z
    .string()
    .min(8)
    .max(100)
    .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra.')
    .regex(/[0-9]/, 'Inclua pelo menos um número.'),
}).strict().refine(
  (dados) => dados.senha_atual !== dados.nova_senha,
  { message: 'A nova senha deve ser diferente da atual.', path: ['nova_senha'] },
);

// Expiração dos tokens
const TOKEN_EXPIRY = '8h';
const REFRESH_EXPIRY = '30d';

/**
 * Gera o par access-token + refresh-token para um usuário já validado.
 * O campo `iat_minimo` no refresh token é comparado pelo authMiddleware
 * para invalidar tokens emitidos antes de uma troca de senha.
 */
function gerarTokens(usuario, permissoes) {
  const payload = {
    usuario_id: usuario.id,
    empresa_id: usuario.empresa_id,
    perfil: usuario.perfil,
    permissoes,
  };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
  const refreshToken = jwt.sign(
    { usuario_id: usuario.id, empresa_id: usuario.empresa_id },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_EXPIRY, algorithm: 'HS256' },
  );
  return { accessToken, refreshToken };
}

class AuthController {
  async login(req, res) {
    const entrada = loginSchema.safeParse(req.body);
    if (!entrada.success) return res.status(400).json({ erro: 'E-mail ou senha inválidos.' });
    if (!process.env.JWT_SECRET)
      return res.status(500).json({ erro: 'Autenticação não configurada no servidor.' });

    try {
      const result = await db.query(
        `SELECT id, empresa_id, nome, senha_hash, perfil, senha_alterada_em
           FROM usuarios
          WHERE LOWER(email) = LOWER($1)
            AND ativo = TRUE
            AND deleted_at IS NULL`,
        [entrada.data.email],
      );
      const usuario = result.rows[0];
      const senhaValida = usuario && (await bcrypt.compare(entrada.data.senha, usuario.senha_hash));
      if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas.' });

      const overrides = await db.query(
        'SELECT permissao, permitido FROM usuario_permissoes WHERE usuario_id = $1',
        [usuario.id],
      );
      const base = new Set(padroes[usuario.perfil] || []);
      for (const item of overrides.rows)
        item.permitido ? base.add(item.permissao) : base.delete(item.permissao);
      const permissoes = [...base];

      const { accessToken, refreshToken } = gerarTokens(usuario, permissoes);

      return res.json({
        mensagem: 'Login realizado com sucesso.',
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          perfil: usuario.perfil,
          empresa_id: usuario.empresa_id,
          permissoes,
        },
        token: accessToken,
        refresh_token: refreshToken,
        expira_em: TOKEN_EXPIRY,
      });
    } catch (error) {
      logger.erro('Erro no login', { request_id: req.id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha interna ao autenticar.' });
    }
  }

  /**
   * Emite um novo access-token a partir de um refresh-token válido.
   * Rejeita refresh-tokens emitidos antes da última troca de senha.
   */
  async refresh(req, res) {
    const { refresh_token: refreshToken } = req.body || {};
    if (!refreshToken)
      return res.status(400).json({ erro: 'refresh_token não fornecido.' });
    if (!process.env.JWT_SECRET)
      return res.status(500).json({ erro: 'Autenticação não configurada no servidor.' });

    try {
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      } catch {
        return res.status(401).json({ erro: 'Refresh token inválido ou expirado. Faça login novamente.' });
      }

      const result = await db.query(
        `SELECT id, empresa_id, nome, perfil, ativo, deleted_at, senha_alterada_em
           FROM usuarios
          WHERE id = $1 AND empresa_id = $2 AND ativo = TRUE AND deleted_at IS NULL`,
        [decoded.usuario_id, decoded.empresa_id],
      );
      const usuario = result.rows[0];
      if (!usuario)
        return res.status(401).json({ erro: 'Usuário não encontrado ou inativo.' });

      // Invalida refresh tokens emitidos antes da última troca de senha
      if (usuario.senha_alterada_em) {
        const alteradoEm = Math.floor(new Date(usuario.senha_alterada_em).getTime() / 1000);
        if (decoded.iat < alteradoEm)
          return res.status(401).json({ erro: 'Sessão expirada após troca de senha. Faça login novamente.' });
      }

      const overrides = await db.query(
        'SELECT permissao, permitido FROM usuario_permissoes WHERE usuario_id = $1',
        [usuario.id],
      );
      const base = new Set(padroes[usuario.perfil] || []);
      for (const item of overrides.rows)
        item.permitido ? base.add(item.permissao) : base.delete(item.permissao);
      const permissoes = [...base];

      const { accessToken, refreshToken: novoRefresh } = gerarTokens(usuario, permissoes);

      return res.json({
        token: accessToken,
        refresh_token: novoRefresh,
        expira_em: TOKEN_EXPIRY,
      });
    } catch (error) {
      logger.erro('Erro no refresh', { request_id: req.id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao renovar sessão.' });
    }
  }

  async alterarSenha(req, res) {
    const entrada = senhaSchema.safeParse(req.body);
    if (!entrada.success)
      return res.status(400).json({ erro: entrada.error.issues[0]?.message || 'Senha inválida.' });

    try {
      const result = await db.query(
        'SELECT senha_hash FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL',
        [req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id],
      );
      if (
        !result.rows[0] ||
        !(await bcrypt.compare(entrada.data.senha_atual, result.rows[0].senha_hash))
      )
        return res.status(401).json({ erro: 'A senha atual está incorreta.' });

      const hash = await bcrypt.hash(entrada.data.nova_senha, 12);

      // Grava senha_alterada_em para invalidar tokens emitidos antes desta alteração
      await db.query(
        'UPDATE usuarios SET senha_hash=$1, senha_alterada_em=NOW() WHERE id=$2 AND empresa_id=$3',
        [hash, req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id],
      );

      return res.json({ mensagem: 'Senha alterada. Entre novamente com a nova senha.' });
    } catch (error) {
      logger.erro('Erro ao alterar senha', { request_id: req.id, erro_mensagem: error.message });
      return res.status(500).json({ erro: 'Falha ao alterar senha.' });
    }
  }
}

module.exports = new AuthController();
