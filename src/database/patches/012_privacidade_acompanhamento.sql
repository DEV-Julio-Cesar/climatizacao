ALTER TABLE privacidade_solicitacoes ADD COLUMN IF NOT EXISTS client_uuid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS ux_privacidade_reenvio
  ON privacidade_solicitacoes(empresa_id,solicitante_id,client_uuid) WHERE client_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_privacidade_status
  ON privacidade_solicitacoes(empresa_id,status,created_at DESC,id);
CREATE INDEX IF NOT EXISTS idx_privacidade_historico_pedido
  ON privacidade_historico(solicitacao_id,id);
