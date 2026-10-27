-- Patch 002 — Tabela de auditoria para solicitações LGPD
-- Execute uma vez no banco de produção:
--   psql $DATABASE_URL -f src/database/patches/002_lgpd_auditoria.sql

CREATE TABLE IF NOT EXISTS lgpd_auditoria (
  id          SERIAL      PRIMARY KEY,
  usuario_id  INTEGER     NOT NULL,   -- pode não ter FK se o usuário foi removido
  empresa_id  INTEGER     NOT NULL,
  tipo        VARCHAR(40) NOT NULL    -- 'EXPORTACAO_DADOS' | 'EXCLUSAO_DADOS'
              CHECK (tipo IN ('EXPORTACAO_DADOS', 'EXCLUSAO_DADOS')),
  ip_origem   VARCHAR(45),            -- IPv4 ou IPv6
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas por empresa (relatório de auditoria do gestor)
CREATE INDEX IF NOT EXISTS ix_lgpd_auditoria_empresa
  ON lgpd_auditoria (empresa_id, created_at DESC);

COMMENT ON TABLE lgpd_auditoria IS
  'Registro imutável de solicitações de portabilidade e exclusão de dados (LGPD Art. 37).';
