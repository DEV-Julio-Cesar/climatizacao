ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS client_uuid VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagamentos_empresa_uuid ON pagamentos(empresa_id,client_uuid) WHERE client_uuid IS NOT NULL;
