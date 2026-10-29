const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../config/database');
const logger = require('../config/logger');
const { padroes } = require('../middlewares/permissaoMiddleware');

const loginSchema = z.object({
  email: z.string().trim().email().max(150),
  senha: z.string().min(6).max(200),
  cliente: z.enum(['web', 'mobile']).optional(),
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

// Duração dos cookies em ms (deve bater com REFRESH_EXPIRY)
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

/**
 * Define o cookie HttpOnly de refresh token na resposta.
 * Seguro contra XSS: inacessível ao JavaScript da página.
 * SameSite=Strict protege contra CSRF.
 */
function setRefreshCookie(res, token) {
  res.cookie('climasaas_refresh', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/auth/refresh',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('climasaas_refresh', { path: '/auth/refresh' });
}

/**
 * Gera o par access-token + refresh-token para um usuário já validado.
 * O campo `iat_minimo` no refresh token é comparado pelo authMiddleware
 * para invalidar tokens emitidos antes de uma troca de senha.
 */
function gerarTokens(usuario, permissoes, sid = crypto.randomUUID()) {
  const payload = {
    usuario_id: usuario.id,
    empresa_id: usuario.empresa_id,
    perfil: usuario.perfil,
    permissoes,
    token_use: 'access',
    sid,
  };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
  const refreshToken = jwt.sign(
    { usuario_id: usuario.id, empresa_id: usuario.empresa_id, token_use: 'refresh', sid, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_EXPIRY, algorithm: 'HS256' },
  );
  return { accessToken, refreshToken, sid };
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

      const { accessToken, refreshToken, sid } = gerarTokens(usuario, permissoes);
      const criada=await db.transaction(async client=>{
        const atual=await client.query('SELECT id FROM usuarios WHERE id=$1 AND empresa_id=$2 AND senha_hash=$3 AND ativo=TRUE AND deleted_at IS NULL FOR UPDATE',[usuario.id,usuario.empresa_id,usuario.senha_hash]);
        if(!atual.rows.length)return false;
        await client.query("INSERT INTO sessoes(id,usuario_id,empresa_id,refresh_hash,expira_em) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 days')",[sid,usuario.id,usuario.empresa_id,hashToken(refreshToken)]);
        return true;
      });
      if(!criada)return res.status(401).json({erro:'As credenciais mudaram. Entre novamente.'});

      // Cookie HttpOnly para o painel web (protege contra XSS).
      // O JSON ainda inclui os tokens para retrocompatibilidade com o app mobile,
      // que usa expo-secure-store em vez de cookies.
      if (req.body.cliente === 'web') setRefreshCookie(res, refreshToken);

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
        refresh_token: req.body.cliente === 'web' ? undefined : refreshToken,
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
    // Aceita refresh token via cookie HttpOnly (web) ou corpo JSON (mobile)
    const refreshToken = req.body?.refresh_token || req.cookies?.climasaas_refresh;
    const clienteWeb=req.body?.cliente==='web'||(!req.body?.refresh_token&&Boolean(req.cookies?.climasaas_refresh));
    if (!refreshToken)
      return res.status(400).json({ erro: 'refresh_token não fornecido.' });
    if (!process.env.JWT_SECRET)
      return res.status(500).json({ erro: 'Autenticação não configurada no servidor.' });

    try {
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.token_use !== 'refresh' || !decoded.sid) throw new Error('Tipo inválido.');
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

      const { accessToken, refreshToken: novoRefresh } = gerarTokens(usuario, permissoes, decoded.sid);
      const rotacao = await db.query(
        "UPDATE sessoes SET refresh_hash=$1,expira_em=NOW()+INTERVAL '30 days' WHERE id=$2 AND usuario_id=$3 AND empresa_id=$4 AND refresh_hash=$5 AND revogada_em IS NULL AND expira_em>NOW() RETURNING id",
        [hashToken(novoRefresh), decoded.sid, usuario.id, usuario.empresa_id, hashToken(refreshToken)],
      );
      if (!rotacao.rows.length) { clearRefreshCookie(res); return res.status(401).json({ erro: 'Sessão expirada ou token já utilizado.' }); }

      // Rotaciona o cookie HttpOnly (web) e mantém o JSON para o mobile
      if (clienteWeb) setRefreshCookie(res, novoRefresh);

      return res.json({
        token: accessToken,
        refresh_token: clienteWeb ? undefined : novoRefresh,
        usuario: { id: usuario.id, empresa_id: usuario.empresa_id, nome: usuario.nome, perfil: usuario.perfil, permissoes },
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
      await db.transaction(async client => {
        const result = await client.query(
          'SELECT senha_hash FROM usuarios WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE AND deleted_at IS NULL FOR UPDATE',
          [req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id],
        );
        if (!result.rows[0] || !(await bcrypt.compare(entrada.data.senha_atual, result.rows[0].senha_hash)))
          throw Object.assign(new Error('A senha atual está incorreta.'),{status:401});
        const hash = await bcrypt.hash(entrada.data.nova_senha, 12);
        await client.query(
          'UPDATE usuarios SET senha_hash=$1, senha_alterada_em=NOW() WHERE id=$2 AND empresa_id=$3',
          [hash, req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id],
        );
        await client.query('UPDATE sessoes SET revogada_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND revogada_em IS NULL', [req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id]);
        await client.query('UPDATE recuperacoes_senha SET usado_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND usado_em IS NULL',[req.usuarioLogado.usuario_id,req.usuarioLogado.empresa_id]);
      });

      return res.json({ mensagem: 'Senha alterada. Entre novamente com a nova senha.' });
    } catch (error) {
      logger.erro('Erro ao alterar senha', { request_id: req.id, erro_mensagem: error.message });
      return res.status(error.status||500).json({ erro: error.status?error.message:'Falha ao alterar senha.' });
    }
  }

  async logout(req, res) {
    try {
      const token = req.body?.refresh_token || req.cookies?.climasaas_refresh;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.token_use === 'refresh' && decoded.sid)
          await db.query('UPDATE sessoes SET revogada_em=NOW() WHERE id=$1 AND usuario_id=$2 AND empresa_id=$3', [decoded.sid, decoded.usuario_id, decoded.empresa_id]);
      }
    } catch (error) {
      if (!(error instanceof jwt.JsonWebTokenError)) return res.status(503).json({ erro: 'Não foi possível encerrar a sessão. Tente novamente.' });
    }
    clearRefreshCookie(res);
    return res.json({ mensagem: 'Sessão encerrada.' });
  }
}

module.exports = new AuthController();
