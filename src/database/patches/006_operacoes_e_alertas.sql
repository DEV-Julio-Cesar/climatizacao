CREATE TABLE IF NOT EXISTS operacoes_idempotentes (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  chave VARCHAR(100) NOT NULL,
  fingerprint TEXT NOT NULL,
  resultado JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(empresa_id,usuario_id,chave)
);
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS chave_alerta TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_notificacao_chave_alerta ON notificacoes(empresa_id,usuario_id,chave_alerta) WHERE chave_alerta IS NOT NULL;
