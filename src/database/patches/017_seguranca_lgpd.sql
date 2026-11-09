DELETE FROM usuario_permissoes WHERE permissao='*';
ALTER TABLE usuario_permissoes ADD CONSTRAINT usuario_permissao_sem_curinga CHECK(permissao <> '*');
CREATE TABLE whatsapp_numeros (
  phone_number_id VARCHAR(40) PRIMARY KEY CHECK (phone_number_id ~ '^[0-9]+$'),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id)
);
CREATE TABLE seguranca_auditoria (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  usuario_id INTEGER NOT NULL,
  acao VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX empresas_cnpj_normalizado ON empresas ((regexp_replace(upper(cnpj),'[^A-Z0-9]','','g'))) WHERE cnpj IS NOT NULL AND cnpj <> '';
ALTER TABLE ordens_servico ADD COLUMN pdf_compartilhamento_revogado BOOLEAN NOT NULL DEFAULT FALSE;
