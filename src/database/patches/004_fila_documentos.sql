CREATE TABLE IF NOT EXISTS fila_documentos (
  os_id INTEGER PRIMARY KEY REFERENCES ordens_servico(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tentativas INTEGER NOT NULL DEFAULT 0,
  executar_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bloqueado_ate TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  ultimo_erro TEXT
);
