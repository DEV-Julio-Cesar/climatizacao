ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS tipo_cancelamento VARCHAR(30);

UPDATE ordens_servico SET tipo_cancelamento='CLIENTE_DESISTIU'
 WHERE status='CANCELADA' AND motivo_cancelamento IS NOT NULL AND tipo_cancelamento IS NULL;

ALTER TABLE ordens_servico DROP CONSTRAINT IF EXISTS ordens_servico_tipo_cancelamento_check;
ALTER TABLE ordens_servico ADD CONSTRAINT ordens_servico_tipo_cancelamento_check CHECK (
  tipo_cancelamento IS NULL OR tipo_cancelamento IN (
    'CLIENTE_DESISTIU','CLIENTE_AUSENTE','SEM_PECA','DUPLICIDADE_ERRO','ADMINISTRATIVO','OUTRO'
  )
);

CREATE INDEX IF NOT EXISTS idx_os_cancelamento_empresa_tipo
  ON ordens_servico(empresa_id,tipo_cancelamento,created_at DESC) WHERE status='CANCELADA';
