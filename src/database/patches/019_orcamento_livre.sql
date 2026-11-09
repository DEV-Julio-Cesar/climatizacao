ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE orcamentos ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE orcamentos ADD COLUMN destinatario_snapshot JSONB;
ALTER TABLE orcamentos ADD COLUMN empresa_snapshot JSONB;
ALTER TABLE orcamentos ADD CONSTRAINT orcamento_destinatario CHECK (cliente_id IS NOT NULL OR (destinatario_snapshot IS NOT NULL AND COALESCE(length(trim(destinatario_snapshot->>'nome')),0) >= 2));
