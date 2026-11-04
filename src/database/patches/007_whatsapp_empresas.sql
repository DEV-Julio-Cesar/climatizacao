CREATE TABLE IF NOT EXISTS empresas_whatsapp (
  empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id),
  phone_number_id VARCHAR(80) NOT NULL UNIQUE,
  token_env VARCHAR(120) NOT NULL CHECK(token_env ~ '^WHATSAPP_ACCESS_TOKEN_[A-Z0-9_]+$'),
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
