-- Fundação comercial multiempresa, aditiva e retrocompatível.
-- As colunas antigas permanecem enquanto API e telas migram gradualmente.

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS razao_social VARCHAR(180);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(180);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inscricao_estadual VARCHAR(30);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cep VARCHAR(8);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS endereco VARCHAR(255);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS numero VARCHAR(20);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS complemento VARCHAR(120);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS bairro VARCHAR(120);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS estado CHAR(2);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo_storage_key VARCHAR(500);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS filiais (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nome VARCHAR(150) NOT NULL,
  codigo VARCHAR(30) NOT NULL,
  cnpj VARCHAR(14),
  inscricao_estadual VARCHAR(30),
  telefone VARCHAR(20),
  email VARCHAR(150),
  cep VARCHAR(8), endereco VARCHAR(255), numero VARCHAR(20), complemento VARCHAR(120),
  bairro VARCHAR(120), cidade VARCHAR(100), estado CHAR(2),
  matriz BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(id,empresa_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_filiais_empresa_codigo_ativo ON filiais(empresa_id,codigo) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_filiais_empresa_cnpj_ativo ON filiais(empresa_id,cnpj) WHERE cnpj IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_filiais_uma_matriz ON filiais(empresa_id) WHERE matriz=TRUE AND deleted_at IS NULL;

INSERT INTO filiais(empresa_id,nome,codigo,cnpj,matriz)
SELECT e.id,COALESCE(e.nome_fantasia,e.nome),'MATRIZ',regexp_replace(COALESCE(e.cnpj,''),'\D','','g'),TRUE
FROM empresas e WHERE e.deleted_at IS NULL
AND NOT EXISTS(SELECT 1 FROM filiais f WHERE f.empresa_id=e.id AND f.matriz=TRUE AND f.deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS locais_estoque (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  filial_id INTEGER,
  nome VARCHAR(120) NOT NULL,
  codigo VARCHAR(30) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'DEPOSITO' CHECK(tipo IN('DEPOSITO','LOJA','VEICULO','TECNICO','TERCEIRO')),
  responsavel_id INTEGER REFERENCES usuarios(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(id,empresa_id),
  CONSTRAINT fk_local_filial_empresa FOREIGN KEY(filial_id,empresa_id) REFERENCES filiais(id,empresa_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_locais_empresa_codigo_ativo ON locais_estoque(empresa_id,codigo) WHERE deleted_at IS NULL;

INSERT INTO locais_estoque(empresa_id,filial_id,nome,codigo,tipo)
SELECT f.empresa_id,f.id,'Estoque principal','PRINCIPAL','DEPOSITO' FROM filiais f
WHERE f.matriz=TRUE AND f.deleted_at IS NULL
AND NOT EXISTS(SELECT 1 FROM locais_estoque l WHERE l.empresa_id=f.empresa_id AND l.codigo='PRINCIPAL' AND l.deleted_at IS NULL);

-- Documento pessoal: o legado cpf_cnpj será migrado pela aplicação para cifra + hash.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_pessoa VARCHAR(10) CHECK(tipo_pessoa IN('FISICA','JURIDICA'));
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS documento_cifrado TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS documento_hash CHAR(64);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS inscricao_estadual VARCHAR(30);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS razao_social VARCHAR(180);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(180);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS consentimento_em TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_empresa_documento_hash ON clientes(empresa_id,documento_hash) WHERE documento_hash IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS arquivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  entidade_tipo VARCHAR(30) NOT NULL CHECK(entidade_tipo IN('EMPRESA','CLIENTE','OS','EQUIPAMENTO','PRODUTO','UNIDADE_ESTOQUE','COMPRA','VENDA','AVALIACAO','GARANTIA')),
  entidade_id VARCHAR(80) NOT NULL,
  categoria VARCHAR(30) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  nome_original VARCHAR(255),
  mime_type VARCHAR(120) NOT NULL,
  tamanho_bytes BIGINT NOT NULL CHECK(tamanho_bytes>=0),
  checksum_sha256 CHAR(64) NOT NULL,
  criado_por INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_arquivos_entidade ON arquivos(empresa_id,entidade_tipo,entidade_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_arquivos_checksum ON arquivos(empresa_id,checksum_sha256) WHERE deleted_at IS NULL;

ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS numero VARCHAR(40);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS filial_id INTEGER;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS prioridade VARCHAR(15) NOT NULL DEFAULT 'NORMAL' CHECK(prioridade IN('BAIXA','NORMAL','ALTA','URGENTE'));
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS canal_origem VARCHAR(20);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS os_garantia_origem_id INTEGER REFERENCES ordens_servico(id);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS cliente_snapshot JSONB;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS equipamento_snapshot JSONB;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS endereco_execucao_snapshot JSONB;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS custo_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(custo_total>=0);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS comissao_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(comissao_total>=0);
CREATE UNIQUE INDEX IF NOT EXISTS idx_os_empresa_numero ON ordens_servico(empresa_id,numero) WHERE numero IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_os_filial_data ON ordens_servico(empresa_id,filial_id,created_at DESC);

ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS categoria VARCHAR(60);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS origem VARCHAR(20) CHECK(origem IN('CADASTRADO','VENDIDO','INSTALADO','USADO','TROCA'));
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS condicao VARCHAR(20) CHECK(condicao IN('NOVO','SEMINOVO','USADO','RECONDICIONADO','SUCATA'));
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK(status IN('ATIVO','REMOVIDO','VENDIDO','DESCARTADO','EM_MANUTENCAO'));
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS fabricado_em DATE;
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS adquirido_em DATE;
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS custo_aquisicao NUMERIC(12,2) CHECK(custo_aquisicao>=0);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC(12,2) CHECK(valor_estimado>=0);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_aparelhos_empresa_serie ON aparelhos(empresa_id,numero_serie) WHERE numero_serie IS NOT NULL AND numero_serie<>'' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS equipamento_proprietarios (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  aparelho_id INTEGER NOT NULL REFERENCES aparelhos(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fim_em TIMESTAMPTZ,
  origem VARCHAR(30),
  documento_referencia VARCHAR(80),
  criado_por INTEGER REFERENCES usuarios(id),
  CHECK(fim_em IS NULL OR fim_em>=inicio_em)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipamento_proprietario_atual ON equipamento_proprietarios(aparelho_id) WHERE fim_em IS NULL;

CREATE TABLE IF NOT EXISTS unidades_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  filial_id INTEGER,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  local_estoque_id INTEGER NOT NULL,
  numero_serie VARCHAR(120),
  patrimonio VARCHAR(120),
  condicao VARCHAR(20) NOT NULL CHECK(condicao IN('NOVO','SEMINOVO','USADO','RECONDICIONADO','SUCATA')),
  status VARCHAR(20) NOT NULL DEFAULT 'EM_AVALIACAO' CHECK(status IN('EM_AVALIACAO','DISPONIVEL','RESERVADO','VENDIDO','INSTALADO','EM_MANUTENCAO','DESCARTADO')),
  custo_aquisicao NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(custo_aquisicao>=0),
  custo_reparo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(custo_reparo>=0),
  preco_venda NUMERIC(12,2) CHECK(preco_venda>=0),
  fornecedor_id INTEGER REFERENCES fornecedores(id),
  cliente_origem_id INTEGER REFERENCES clientes(id),
  adquirido_em DATE,
  garantia_ate DATE,
  observacoes TEXT,
  versao INTEGER NOT NULL DEFAULT 1 CHECK(versao>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_unidade_filial_empresa FOREIGN KEY(filial_id,empresa_id) REFERENCES filiais(id,empresa_id),
  CONSTRAINT fk_unidade_local_empresa FOREIGN KEY(local_estoque_id,empresa_id) REFERENCES locais_estoque(id,empresa_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unidades_empresa_serie ON unidades_estoque(empresa_id,numero_serie) WHERE numero_serie IS NOT NULL AND numero_serie<>'' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_unidades_disponiveis ON unidades_estoque(empresa_id,local_estoque_id,produto_id,status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS avaliacoes_equipamento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  filial_id INTEGER,
  cliente_id INTEGER REFERENCES clientes(id),
  unidade_estoque_id UUID REFERENCES unidades_estoque(id),
  responsavel_id INTEGER NOT NULL REFERENCES usuarios(id),
  marca VARCHAR(100), modelo VARCHAR(100), numero_serie VARCHAR(120), capacidade VARCHAR(50),
  condicao_declarada VARCHAR(20), testes JSONB NOT NULL DEFAULT '[]'::jsonb, defeitos TEXT,
  valor_solicitado NUMERIC(12,2) CHECK(valor_solicitado>=0),
  valor_avaliado NUMERIC(12,2) CHECK(valor_avaliado>=0),
  valor_aprovado NUMERIC(12,2) CHECK(valor_aprovado>=0),
  status VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN('RASCUNHO','EM_ANALISE','APROVADA','RECUSADA','CONCLUIDA')),
  observacoes TEXT,
  avaliado_em TIMESTAMPTZ,
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_avaliacao_filial_empresa FOREIGN KEY(filial_id,empresa_id) REFERENCES filiais(id,empresa_id)
);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_empresa_status ON avaliacoes_equipamento(empresa_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS vendas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  filial_id INTEGER,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  numero VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN('RASCUNHO','RESERVADA','CONFIRMADA','FATURADA','CONCLUIDA','CANCELADA')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(subtotal>=0),
  desconto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(desconto>=0),
  frete NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(frete>=0),
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(total>=0),
  custo_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(custo_total>=0),
  cliente_snapshot JSONB NOT NULL,
  observacoes TEXT,
  confirmada_em TIMESTAMPTZ, concluida_em TIMESTAMPTZ, cancelada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_venda_filial_empresa FOREIGN KEY(filial_id,empresa_id) REFERENCES filiais(id,empresa_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_empresa_numero ON vendas(empresa_id,numero) WHERE numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendas_empresa_status ON vendas(empresa_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS venda_itens (
  id BIGSERIAL PRIMARY KEY,
  venda_id UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  tipo VARCHAR(15) NOT NULL CHECK(tipo IN('PRODUTO','EQUIPAMENTO','SERVICO')),
  produto_id INTEGER REFERENCES produtos(id),
  unidade_estoque_id UUID REFERENCES unidades_estoque(id),
  descricao VARCHAR(255) NOT NULL,
  quantidade NUMERIC(12,2) NOT NULL CHECK(quantidade>0),
  custo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(custo_unitario>=0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK(valor_unitario>=0),
  desconto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(desconto>=0),
  subtotal NUMERIC(12,2) NOT NULL CHECK(subtotal>=0),
  CHECK((tipo='EQUIPAMENTO' AND unidade_estoque_id IS NOT NULL AND quantidade=1) OR tipo<>'EQUIPAMENTO')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_venda_unidade_unica ON venda_itens(unidade_estoque_id) WHERE unidade_estoque_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS venda_pagamentos (
  id BIGSERIAL PRIMARY KEY,
  venda_id UUID NOT NULL REFERENCES vendas(id),
  forma VARCHAR(20) NOT NULL CHECK(forma IN('DINHEIRO','PIX','DEBITO','CREDITO','BOLETO','TRANSFERENCIA')),
  valor NUMERIC(12,2) NOT NULL CHECK(valor>0),
  referencia VARCHAR(120),
  recebido_por INTEGER REFERENCES usuarios(id),
  pago_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estornado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS garantias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  venda_id UUID REFERENCES vendas(id),
  venda_item_id BIGINT REFERENCES venda_itens(id),
  aparelho_id INTEGER REFERENCES aparelhos(id),
  inicio DATE NOT NULL,
  fim DATE NOT NULL,
  termos TEXT,
  status VARCHAR(15) NOT NULL DEFAULT 'ATIVA' CHECK(status IN('ATIVA','EXPIRADA','CANCELADA','ACIONADA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(fim>=inicio)
);
CREATE INDEX IF NOT EXISTS idx_garantias_empresa_status ON garantias(empresa_id,status,fim);

CREATE TABLE IF NOT EXISTS dominio_auditoria (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  entidade_tipo VARCHAR(40) NOT NULL,
  entidade_id VARCHAR(80) NOT NULL,
  acao VARCHAR(40) NOT NULL,
  dados JSONB,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dominio_auditoria_entidade ON dominio_auditoria(empresa_id,entidade_tipo,entidade_id,created_at DESC);
