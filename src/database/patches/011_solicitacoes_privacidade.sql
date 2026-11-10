CREATE TABLE IF NOT EXISTS privacidade_solicitacoes (
  id UUID PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
  cliente_id INTEGER REFERENCES clientes(id),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ACESSO','CORRECAO','EXCLUSAO','INFORMACAO','OPOSICAO')),
  descricao VARCHAR(2000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RECEBIDA' CHECK (status IN ('RECEBIDA','EM_ANALISE','CONCLUIDA')),
  resposta VARCHAR(4000),
  responsavel_id INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_privacidade_empresa ON privacidade_solicitacoes(empresa_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS idx_privacidade_solicitante ON privacidade_solicitacoes(empresa_id,solicitante_id,created_at DESC);
CREATE TABLE IF NOT EXISTS privacidade_historico (
  id BIGSERIAL PRIMARY KEY,
  solicitacao_id UUID NOT NULL REFERENCES privacidade_solicitacoes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('RECEBIDA','EM_ANALISE','CONCLUIDA')),
  resposta VARCHAR(4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
