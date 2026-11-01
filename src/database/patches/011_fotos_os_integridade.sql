ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS criado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS nome_original VARCHAR(255);
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS tamanho_bytes BIGINT CHECK(tamanho_bytes>=0);
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64);
UPDATE os_fotos SET storage_key=uuid_generate_v4() WHERE storage_key IS NULL;

UPDATE os_fotos f SET empresa_id=os.empresa_id
FROM ordens_servico os WHERE os.id=f.os_id AND f.empresa_id IS NULL;
ALTER TABLE os_fotos ALTER COLUMN empresa_id SET NOT NULL;

DROP INDEX IF EXISTS idx_os_fotos_client_uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_os_fotos_empresa_client_uuid
  ON os_fotos(empresa_id,client_uuid) WHERE client_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_os_fotos_empresa_os_tipo
  ON os_fotos(empresa_id,os_id,tipo,capturada_em DESC);
CREATE INDEX IF NOT EXISTS idx_os_fotos_checksum
  ON os_fotos(empresa_id,checksum_sha256) WHERE checksum_sha256 IS NOT NULL;
