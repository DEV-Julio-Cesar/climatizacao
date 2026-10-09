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

CREATE TABLE IF NOT EXISTS usuario_permissoes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao VARCHAR(60) NOT NULL,
  permitido BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, permissao)
);

CREATE TABLE IF NOT EXISTS checklist_modelos (
  id SERIAL PRIMARY KEY, empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  tipo_servico VARCHAR(30) NOT NULL, item VARCHAR(150) NOT NULL, ordem INTEGER NOT NULL DEFAULT 0,
  obrigatorio BOOLEAN NOT NULL DEFAULT TRUE, ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_modelo_unico ON checklist_modelos (COALESCE(empresa_id,0),tipo_servico,item);
INSERT INTO checklist_modelos (empresa_id,tipo_servico,item,ordem) VALUES
  (NULL,'LIMPEZA','Filtros higienizados',1),(NULL,'LIMPEZA','Serpentina evaporadora limpa',2),(NULL,'LIMPEZA','Condensadora limpa',3),(NULL,'LIMPEZA','Dreno desobstruído',4),(NULL,'LIMPEZA','Funcionamento testado',5),
  (NULL,'INSTALACAO','Suportes fixados',1),(NULL,'INSTALACAO','Tubulação isolada',2),(NULL,'INSTALACAO','Dreno testado',3),(NULL,'INSTALACAO','Vácuo realizado',4),(NULL,'INSTALACAO','Funcionamento testado',5),
  (NULL,'REMOCAO','Gás recolhido',1),(NULL,'REMOCAO','Rede elétrica isolada',2),(NULL,'REMOCAO','Tubulação vedada',3),(NULL,'REMOCAO','Local deixado limpo',4),
  (NULL,'PREVENTIVA','Filtros verificados',1),(NULL,'PREVENTIVA','Serpentinas verificadas',2),(NULL,'PREVENTIVA','Dreno verificado',3),(NULL,'PREVENTIVA','Conexões elétricas verificadas',4),(NULL,'PREVENTIVA','Operação testada',5),
  (NULL,'PROBLEMA_TECNICO','Defeito reproduzido',1),(NULL,'PROBLEMA_TECNICO','Componentes testados',2),(NULL,'PROBLEMA_TECNICO','Causa identificada',3),(NULL,'PROBLEMA_TECNICO','Reparo testado',4),(NULL,'PROBLEMA_TECNICO','Cliente orientado',5)
ON CONFLICT DO NOTHING;

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
  superaquecimento      NUMERIC(7,2),
  subresfriamento       NUMERIC(7,2),
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
  ativo BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(empresa_id, sku)
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
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS a_caminho_em TIMESTAMPTZ;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS checkin_em TIMESTAMPTZ;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS checkin_latitude NUMERIC(10,7);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS checkin_longitude NUMERIC(10,7);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS checkout_em TIMESTAMPTZ;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS checkout_latitude NUMERIC(10,7);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS checkout_longitude NUMERIC(10,7);
ALTER TABLE os_historico ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE os_fotos DROP CONSTRAINT IF EXISTS os_fotos_tipo_check;
ALTER TABLE os_fotos ADD CONSTRAINT os_fotos_tipo_check CHECK (tipo IN ('ANTES','DEPOIS','ASSINATURA','EVIDENCIA'));
ALTER TABLE os_medicoes ADD COLUMN IF NOT EXISTS superaquecimento NUMERIC(7,2);
ALTER TABLE os_medicoes ADD COLUMN IF NOT EXISTS subresfriamento NUMERIC(7,2);
CREATE INDEX IF NOT EXISTS idx_os_agenda     ON ordens_servico(empresa_id, tecnico_id, agendado_para);
CREATE INDEX IF NOT EXISTS idx_checklist_os  ON os_checklist_respostas(os_id);
CREATE INDEX IF NOT EXISTS idx_itens_os      ON os_itens(os_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_empresa ON catalogo_servicos(empresa_id,ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos(empresa_id,ativo);
CREATE INDEX IF NOT EXISTS idx_orcamentos_empresa ON orcamentos(empresa_id,status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_os ON pagamentos(os_id);
ALTER TABLE os_itens ADD COLUMN IF NOT EXISTS referencia_id INTEGER;
ALTER TABLE os_itens ADD COLUMN IF NOT EXISTS estoque_baixado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE catalogo_servicos ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);
ALTER TABLE catalogo_servicos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
CREATE TABLE IF NOT EXISTS dispositivos_push (
  id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE, plataforma VARCHAR(20), ativo BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_usuario ON dispositivos_push(usuario_id,ativo);
CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa_id,status,proxima_visita);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes(empresa_id,usuario_id,lida,created_at);

-- 14. OPERACAO DE CAMPO AVANCADA
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS comentario VARCHAR(500);
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS capturada_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE os_fotos ADD COLUMN IF NOT EXISTS client_uuid VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS idx_os_fotos_client_uuid ON os_fotos(client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS pausado_em TIMESTAMPTZ;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS total_pausa_segundos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS situacao_pendencia VARCHAR(30);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS motivo_pendencia VARCHAR(1000);
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS retorno_de_os_id INTEGER REFERENCES ordens_servico(id);
CREATE TABLE IF NOT EXISTS os_pausas (
  id SERIAL PRIMARY KEY, os_id INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id), motivo VARCHAR(300),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), retomado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_os_pausas_os ON os_pausas(os_id,iniciado_em);

CREATE TABLE IF NOT EXISTS estoque_tecnico (
  tecnico_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(quantidade >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tecnico_id,produto_id)
);
ALTER TABLE estoque_movimentos ADD COLUMN IF NOT EXISTS tecnico_id INTEGER REFERENCES usuarios(id);

ALTER TABLE checklist_modelos ADD COLUMN IF NOT EXISTS exige_observacao_nao_conforme BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE checklist_modelos ADD COLUMN IF NOT EXISTS exige_foto BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE checklist_modelos ADD COLUMN IF NOT EXISTS medicao_campo VARCHAR(50);
ALTER TABLE checklist_modelos ADD COLUMN IF NOT EXISTS valor_minimo NUMERIC(10,2);
ALTER TABLE checklist_modelos ADD COLUMN IF NOT EXISTS valor_maximo NUMERIC(10,2);

-- Dados de demonstração são criados separadamente por `npm run seed`.

-- 15. CENTRAL DE ATENDIMENTO WHATSAPP
CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cliente_id INTEGER REFERENCES clientes(id),
  telefone VARCHAR(20) NOT NULL,
  nome_contato VARCHAR(150),
  ultima_mensagem TEXT,
  ultima_mensagem_em TIMESTAMPTZ,
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  janela_atendimento_ate TIMESTAMPTZ,
  bot_etapa VARCHAR(40) NOT NULL DEFAULT 'INICIO',
  bot_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  fila_status VARCHAR(20) NOT NULL DEFAULT 'AUTOMACAO' CHECK(fila_status IN ('ATENDENDO','ESPERA','AUTOMACAO')),
  atendente_id INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, telefone)
);
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id SERIAL PRIMARY KEY,
  conversa_id INTEGER NOT NULL REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
  whatsapp_id VARCHAR(150) UNIQUE,
  direcao VARCHAR(10) NOT NULL CHECK(direcao IN ('ENTRADA','SAIDA')),
  tipo VARCHAR(30) NOT NULL DEFAULT 'text',
  conteudo TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'recebida',
  enviado_por INTEGER REFERENCES usuarios(id),
  ocorrida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_empresa ON whatsapp_conversas(empresa_id,ultima_mensagem_em DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conversa ON whatsapp_mensagens(conversa_id,ocorrida_em);
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS bot_etapa VARCHAR(40) NOT NULL DEFAULT 'INICIO';
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS bot_ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS fila_status VARCHAR(20) NOT NULL DEFAULT 'AUTOMACAO';
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS atendente_id INTEGER REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_atendente ON whatsapp_conversas(empresa_id,atendente_id,fila_status);
