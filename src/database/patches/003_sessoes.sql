CREATE TABLE IF NOT EXISTS sessoes (
  id UUID PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  refresh_hash TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  revogada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id, empresa_id);
