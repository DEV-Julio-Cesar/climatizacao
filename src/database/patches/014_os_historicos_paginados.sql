CREATE INDEX IF NOT EXISTS idx_os_empresa_finalizadas_id
  ON ordens_servico (empresa_id, id DESC)
  WHERE deleted_at IS NULL AND status = 'FINALIZADA';

CREATE INDEX IF NOT EXISTS idx_os_empresa_cliente_id
  ON ordens_servico (empresa_id, cliente_id, id DESC)
  WHERE deleted_at IS NULL;
