CREATE INDEX IF NOT EXISTS idx_os_empresa_id_ativas
  ON ordens_servico (empresa_id, id DESC)
  WHERE deleted_at IS NULL AND status IN ('ABERTA','EM_ANDAMENTO');

CREATE INDEX IF NOT EXISTS idx_os_empresa_id
  ON ordens_servico (empresa_id, id DESC)
  WHERE deleted_at IS NULL;
