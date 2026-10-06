-- ============================================================
-- MIGRATION — ClimaSaaS
-- Execute no psql ou no painel do seu banco PostgreSQL:
--   psql -U postgres -d clima_saas -f src/database/migration.sql
-- ============================================================

-- Extensão para gerar UUIDs (opcional, usamos SERIAL por padrão)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. EMPRESAS (tenant raiz — cada empresa é um cliente do SaaS)
-- ============================================================
CREATE TABLE IF NOT EXISTS empresas (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(150) NOT NULL,
  cnpj        VARCHAR(18)  UNIQUE,
  telefone    VARCHAR(20),
  email       VARCHAR(150),
  ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ  -- soft delete
);

-- ============================================================
-- 2. USUÁRIOS (técnicos e gestores de cada empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER      NOT NULL REFERENCES empresas(id),
  nome        VARCHAR(150) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  senha_hash  VARCHAR(255) NOT NULL,
  perfil      VARCHAR(20)  NOT NULL DEFAULT 'TECNICO'
                           CHECK (perfil IN ('TECNICO', 'GESTOR', 'ADMIN')),
  ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================================
-- 3. CLIENTES (clientes de cada empresa — Multi-Tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER      NOT NULL REFERENCES empresas(id),
  nome        VARCHAR(150) NOT NULL,
  telefone    VARCHAR(20),
  endereco    VARCHAR(255),
  cep         VARCHAR(9),
  cidade      VARCHAR(100),
  estado      VARCHAR(2),
  latitude    NUMERIC(10,7),
  longitude   NUMERIC(10,7),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================================
-- 4. APARELHOS (equipamentos vinculados a cada cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS aparelhos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER      NOT NULL REFERENCES empresas(id),
  cliente_id  INTEGER      NOT NULL REFERENCES clientes(id),
  marca       VARCHAR(100),
  modelo      VARCHAR(100),
  capacidade  VARCHAR(50),  -- ex: "12000 BTUs"
  numero_serie VARCHAR(100),
  patrimonio   VARCHAR(100),
  tipo_gas     VARCHAR(50),
  ambiente     VARCHAR(120),
  instalado_em DATE,
  garantia_ate DATE,
  proxima_manutencao DATE,
  observacoes TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================================
-- 5. ORDENS DE SERVIÇO
-- ============================================================
CREATE TABLE IF NOT EXISTS ordens_servico (
  id                  SERIAL PRIMARY KEY,
  empresa_id          INTEGER      NOT NULL REFERENCES empresas(id),
  cliente_id          INTEGER      NOT NULL REFERENCES clientes(id),
  aparelho_id         INTEGER      REFERENCES aparelhos(id),
  tecnico_id          INTEGER      NOT NULL REFERENCES usuarios(id),
  tipo_servico        VARCHAR(30)  NOT NULL
                      CHECK (tipo_servico IN (
                        'LIMPEZA', 'INSTALACAO', 'REMOCAO', 'PREVENTIVA', 'PROBLEMA_TECNICO'
                      )),
  descricao_problema  TEXT         NOT NULL,
  diagnostico         TEXT,
  solucao_aplicada    TEXT,
  recomendacoes       TEXT,
  garantia_dias       INTEGER      NOT NULL DEFAULT 0,
  retorno_necessario  BOOLEAN      NOT NULL DEFAULT FALSE,
  iniciado_em         TIMESTAMPTZ,
  status              VARCHAR(20)  NOT NULL DEFAULT 'ABERTA'
                      CHECK (status IN ('ABERTA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA')),
  valor_total         NUMERIC(10,2) DEFAULT 0.00,
  finalizado_em       TIMESTAMPTZ,
  agendado_para       TIMESTAMPTZ,
  pdf_url             VARCHAR(500),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================================
-- 6. FOTOS DA O.S. (antes, depois, assinatura)
-- ============================================================
CREATE TABLE IF NOT EXISTS os_fotos (
  id          SERIAL PRIMARY KEY,
  os_id       INTEGER      NOT NULL REFERENCES ordens_servico(id),
  tipo        VARCHAR(20)  NOT NULL
              CHECK (tipo IN ('ANTES', 'DEPOIS', 'ASSINATURA')),
  url         VARCHAR(500) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. HISTÓRICO DE STATUS (trilha de auditoria imutável)
-- ============================================================
CREATE TABLE IF NOT EXISTS os_historico (
  id               SERIAL PRIMARY KEY,
  os_id            INTEGER      NOT NULL REFERENCES ordens_servico(id),
  status_anterior  VARCHAR(20),
  status_novo      VARCHAR(20)  NOT NULL,
  modificado_por   INTEGER      NOT NULL REFERENCES usuarios(id),
  observacao       TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 8. CHECKLIST TÉCNICO PREENCHIDO
CREATE TABLE IF NOT EXISTS os_checklist_respostas (
  id          SERIAL PRIMARY KEY,
  os_id       INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  item        VARCHAR(150) NOT NULL,
  conforme    BOOLEAN NOT NULL,
  observacao  VARCHAR(500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. MEDIÇÕES TÉCNICAS
CREATE TABLE IF NOT EXISTS os_medicoes (
  id                    SERIAL PRIMARY KEY,
  os_id                 INTEGER NOT NULL UNIQUE REFERENCES ordens_servico(id) ON DELETE CASCADE,
  temperatura_retorno   NUMERIC(7,2),
  temperatura_insuflamento NUMERIC(7,2),
  tensao                NUMERIC(8,2),
  corrente              NUMERIC(8,2),
  pressao_baixa         NUMERIC(8,2),
  pressao_alta          NUMERIC(8,2),
  umidade               NUMERIC(6,2),
  tipo_gas              VARCHAR(50),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. PEÇAS E SERVIÇOS UTILIZADOS
CREATE TABLE IF NOT EXISTS os_itens (
  id             SERIAL PRIMARY KEY,
  os_id          INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  tipo           VARCHAR(10) NOT NULL CHECK (tipo IN ('PECA', 'SERVICO')),
  descricao      VARCHAR(200) NOT NULL,
  quantidade     NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. CATÁLOGO DE SERVIÇOS E PRODUTOS
CREATE TABLE IF NOT EXISTS catalogo_servicos (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), nome VARCHAR(150) NOT NULL,
  descricao TEXT, preco NUMERIC(10,2) NOT NULL DEFAULT 0, custo NUMERIC(10,2) NOT NULL DEFAULT 0,
  garantia_dias INTEGER NOT NULL DEFAULT 0, duracao_minutos INTEGER, ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), nome VARCHAR(150) NOT NULL,
  sku VARCHAR(80), categoria VARCHAR(100), unidade VARCHAR(20) NOT NULL DEFAULT 'UN',
  custo NUMERIC(10,2) NOT NULL DEFAULT 0, preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  estoque NUMERIC(12,2) NOT NULL DEFAULT 0, estoque_minimo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(empresa_id, sku)
);
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), produto_id INTEGER NOT NULL REFERENCES produtos(id),
  os_id INTEGER REFERENCES ordens_servico(id), tipo VARCHAR(10) NOT NULL CHECK(tipo IN ('ENTRADA','SAIDA','AJUSTE')),
  quantidade NUMERIC(12,2) NOT NULL, observacao VARCHAR(300), usuario_id INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. ORÇAMENTOS E PAGAMENTOS
CREATE TABLE IF NOT EXISTS orcamentos (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  aparelho_id INTEGER REFERENCES aparelhos(id), criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  status VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN ('RASCUNHO','ENVIADO','APROVADO','RECUSADO','EXPIRADO','CONVERTIDO')),
  validade DATE, observacoes TEXT, desconto NUMERIC(10,2) NOT NULL DEFAULT 0, subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0, aprovado_em TIMESTAMPTZ, motivo_recusa TEXT,
  os_id INTEGER REFERENCES ordens_servico(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orcamento_itens (
  id SERIAL PRIMARY KEY, orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK(tipo IN ('SERVICO','PECA')), referencia_id INTEGER,
  descricao VARCHAR(200) NOT NULL, quantidade NUMERIC(10,2) NOT NULL CHECK(quantidade>0),
  valor_unitario NUMERIC(10,2) NOT NULL CHECK(valor_unitario>=0)
);
CREATE TABLE IF NOT EXISTS pagamentos (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), os_id INTEGER NOT NULL REFERENCES ordens_servico(id),
  forma VARCHAR(20) NOT NULL CHECK(forma IN ('DINHEIRO','PIX','DEBITO','CREDITO','BOLETO','TRANSFERENCIA')),
  valor NUMERIC(10,2) NOT NULL CHECK(valor>0), observacao VARCHAR(300), recebido_por INTEGER REFERENCES usuarios(id),
  pago_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES — aceleram as buscas mais comuns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_os_empresa    ON ordens_servico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_os_status     ON ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_tecnico    ON ordens_servico(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_fotos_os      ON os_fotos(os_id);
CREATE INDEX IF NOT EXISTS idx_historico_os  ON os_historico(os_id);
-- Atualizações idempotentes para bancos criados por versões anteriores.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep VARCHAR(9);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado VARCHAR(2);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS numero_serie VARCHAR(100);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS patrimonio VARCHAR(100);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS tipo_gas VARCHAR(50);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS ambiente VARCHAR(120);
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS instalado_em DATE;
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS garantia_ate DATE;
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS proxima_manutencao DATE;
ALTER TABLE aparelhos ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMPTZ;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(500);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS diagnostico TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS solucao_aplicada TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS recomendacoes TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS garantia_dias INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS retorno_necessario BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS iniciado_em TIMESTAMPTZ;
ALTER TABLE os_historico ADD COLUMN IF NOT EXISTS observacao TEXT;
CREATE INDEX IF NOT EXISTS idx_os_agenda     ON ordens_servico(empresa_id, tecnico_id, agendado_para);
CREATE INDEX IF NOT EXISTS idx_checklist_os  ON os_checklist_respostas(os_id);
CREATE INDEX IF NOT EXISTS idx_itens_os      ON os_itens(os_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_empresa ON catalogo_servicos(empresa_id,ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos(empresa_id,ativo);
CREATE INDEX IF NOT EXISTS idx_orcamentos_empresa ON orcamentos(empresa_id,status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_os ON pagamentos(os_id);
ALTER TABLE os_itens ADD COLUMN IF NOT EXISTS referencia_id INTEGER;
ALTER TABLE os_itens ADD COLUMN IF NOT EXISTS estoque_baixado BOOLEAN NOT NULL DEFAULT FALSE;

-- 13. CONTRATOS DE MANUTENCAO E NOTIFICACOES
CREATE TABLE IF NOT EXISTS contratos (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  nome VARCHAR(150) NOT NULL, status VARCHAR(15) NOT NULL DEFAULT 'ATIVO' CHECK(status IN ('ATIVO','PAUSADO','ENCERRADO')),
  periodicidade_meses INTEGER NOT NULL CHECK(periodicidade_meses BETWEEN 1 AND 24),
  valor_mensal NUMERIC(10,2) NOT NULL DEFAULT 0, inicio DATE NOT NULL, fim DATE,
  proxima_visita DATE NOT NULL, observacoes TEXT, criado_por INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS contrato_aparelhos (
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  aparelho_id INTEGER NOT NULL REFERENCES aparelhos(id), PRIMARY KEY(contrato_id, aparelho_id)
);
CREATE TABLE IF NOT EXISTS notificacoes (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), usuario_id INTEGER REFERENCES usuarios(id),
  tipo VARCHAR(30) NOT NULL, titulo VARCHAR(150) NOT NULL, mensagem VARCHAR(500) NOT NULL,
  referencia_tipo VARCHAR(30), referencia_id INTEGER, lida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa_id,status,proxima_visita);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes(empresa_id,usuario_id,lida,created_at);

-- Dados de demonstração são criados separadamente por `npm run seed`.
