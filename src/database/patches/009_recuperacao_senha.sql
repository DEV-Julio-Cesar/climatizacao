CREATE TABLE IF NOT EXISTS recuperacoes_senha (
  id UUID PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recuperacao_usuario ON recuperacoes_senha(usuario_id,created_at DESC);
CREATE TABLE IF NOT EXISTS emails_recuperacao (
  id UUID PRIMARY KEY REFERENCES recuperacoes_senha(id),
  conteudo_cifrado TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  executar_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bloqueado_ate TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  ultimo_erro VARCHAR(80)
);
