# 02 — Banco de Dados

PostgreSQL (Neon em produção). Schema definido em `src/database/migration.sql`.  
Patches incrementais em `src/database/patches/`.

---

## Diagrama de Entidades Principais

```
empresas
  └── usuarios (perfil: TECNICO/GESTOR/ADMIN)
  │     └── usuario_permissoes
  └── clientes
  │     └── aparelhos ──────────────────────────┐
  └── ordens_servico ◄──────────────────────────┘
        ├── os_historico
        ├── os_fotos
        ├── os_checklist_respostas
        ├── os_medicoes
        ├── os_itens ──► produtos / catalogo_servicos
        └── os_pausas

  produtos ──► estoque_movimentos
           └── estoque_tecnico (por técnico/veículo)
           └── estoque_reservas (para OS)

  orcamentos ──► orcamento_itens
             └── [converte em] ordens_servico

  pagamentos ──► ordens_servico

  contratos ──► contrato_aparelhos ──► aparelhos
  compras   ──► compra_itens        ──► produtos
  fornecedores ──► compras

  whatsapp_conversas ──► whatsapp_mensagens
  notificacoes
  dispositivos_push
  lgpd_auditoria
```

---

## Tabelas

### Core Multi-Tenant

#### `empresas`
Tenant raiz. Cada empresa é um cliente do SaaS.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | — |
| `nome` | VARCHAR(150) | Nome da empresa |
| `cnpj` | VARCHAR(18) UNIQUE | CNPJ (opcional) |
| `telefone` | VARCHAR(20) | — |
| `email` | VARCHAR(150) | — |
| `ativo` | BOOLEAN DEFAULT TRUE | — |
| `created_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

#### `usuarios`
Técnicos e gestores de cada empresa.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | — |
| `empresa_id` | FK empresas | — |
| `nome` | VARCHAR(150) | — |
| `email` | VARCHAR(150) UNIQUE | Login |
| `senha_hash` | VARCHAR(255) | bcrypt custo 12 |
| `perfil` | VARCHAR(20) | `TECNICO` / `GESTOR` / `ADMIN` |
| `ativo` | BOOLEAN | — |
| `senha_alterada_em` | TIMESTAMPTZ | Para invalidar tokens antigos |
| `created_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

#### `usuario_permissoes`
Overrides individuais de permissão (RBAC granular).

| Coluna | Tipo | Descrição |
|---|---|---|
| `usuario_id` | FK usuarios | — |
| `permissao` | VARCHAR(60) | Nome da permissão |
| `permitido` | BOOLEAN | `true` = concede, `false` = revoga |

---

### Clientes e Equipamentos

#### `clientes`
Clientes finais de cada empresa.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | — |
| `empresa_id` | FK empresas | — |
| `nome` | VARCHAR(150) | — |
| `telefone` | VARCHAR(20) | Para WhatsApp |
| `cpf_cnpj` | VARCHAR(14) | Unique por empresa (quando preenchido) |
| `endereco` | VARCHAR(255) | Logradouro |
| `numero` / `complemento` / `bairro` | VARCHAR | — |
| `cep` | VARCHAR(9) | — |
| `cidade` / `estado` | VARCHAR | — |
| `latitude` / `longitude` | NUMERIC(10,7) | Geocodificação |
| `created_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

#### `aparelhos`
Equipamentos de climatização vinculados a um cliente.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | — |
| `empresa_id` / `cliente_id` | FKs | — |
| `marca` / `modelo` | VARCHAR(100) | — |
| `capacidade` | VARCHAR(50) | Ex: "12000 BTUs" |
| `numero_serie` / `patrimonio` | VARCHAR(100) | — |
| `tipo_gas` | VARCHAR(50) | R-22, R-410A, R-32... |
| `ambiente` | VARCHAR(120) | Sala, quarto, sala-server... |
| `instalado_em` / `garantia_ate` / `proxima_manutencao` | DATE | — |
| `observacoes` | TEXT | — |
| `public_id` | UUID | QR Code público (sem auth) |
| `created_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

---

### Ordens de Serviço

#### `ordens_servico`
Tabela central do sistema.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | — |
| `empresa_id` / `cliente_id` / `tecnico_id` | FKs | — |
| `aparelho_id` | FK (nullable) | — |
| `tipo_servico` | VARCHAR(30) | `LIMPEZA` / `INSTALACAO` / `REMOCAO` / `PREVENTIVA` / `PROBLEMA_TECNICO` |
| `descricao_problema` | TEXT | — |
| `diagnostico` | TEXT | Preenchido pelo técnico |
| `solucao_aplicada` | TEXT | — |
| `recomendacoes` | TEXT | — |
| `garantia_dias` | INTEGER DEFAULT 0 | — |
| `status` | VARCHAR(20) | `ABERTA` / `EM_ANDAMENTO` / `FINALIZADA` / `CANCELADA` |
| `valor_total` | NUMERIC(10,2) | Calculado pelos itens |
| `agendado_para` | TIMESTAMPTZ | Data/hora prevista |
| `duracao_prevista_minutos` | INTEGER DEFAULT 120 | Para verificação de conflito de agenda |
| `iniciado_em` | TIMESTAMPTZ | Momento do check-in |
| `finalizado_em` | TIMESTAMPTZ | — |
| `a_caminho_em` | TIMESTAMPTZ | — |
| `checkin_em` / `checkout_em` | TIMESTAMPTZ | — |
| `checkin_latitude` / `checkin_longitude` | NUMERIC(10,7) | GPS check-in |
| `checkout_latitude` / `checkout_longitude` | NUMERIC(10,7) | GPS check-out |
| `pausado_em` | TIMESTAMPTZ | Momento atual da pausa |
| `total_pausa_segundos` | INTEGER DEFAULT 0 | Acumulado de todas as pausas |
| `retorno_necessario` | BOOLEAN | — |
| `situacao_pendencia` / `motivo_pendencia` | VARCHAR / TEXT | — |
| `retorno_de_os_id` | FK (self) | OS pai quando é um retorno |
| `pdf_url` | VARCHAR(500) | URL pública do relatório |
| `pdf_storage_key` | UUID | Chave para servir PDF do banco |
| `pdf_conteudo` | BYTEA | PDF binário armazenado no banco |
| `created_at` / `updated_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Máquina de estados:**
```
ABERTA ──────────────► EM_ANDAMENTO ──► FINALIZADA
  │                          │
  └─────────────────────► CANCELADA
```

#### `os_historico`
Trilha de auditoria imutável. Registra toda mudança de status.

| Coluna | Tipo |
|---|---|
| `os_id` | FK |
| `status_anterior` / `status_novo` | VARCHAR |
| `modificado_por` | FK usuarios |
| `observacao` | TEXT |
| `created_at` | TIMESTAMPTZ |

#### `os_fotos`
Fotos de evidência, assinatura e outros registros.

| Coluna | Tipo | Descrição |
|---|---|---|
| `os_id` | FK | — |
| `tipo` | VARCHAR | `ANTES` / `DEPOIS` / `ASSINATURA` / `EVIDENCIA` |
| `url` | VARCHAR(500) | URL de acesso |
| `storage_key` | UUID | Chave para servir do banco |
| `conteudo` | BYTEA | Binário da imagem |
| `mime_type` | VARCHAR(50) | `image/jpeg` ou `image/png` |
| `comentario` | VARCHAR(500) | — |
| `latitude` / `longitude` | NUMERIC(10,7) | GPS no momento da foto |
| `capturada_em` | TIMESTAMPTZ | — |
| `client_uuid` | VARCHAR(80) | Deduplicação offline |

#### `os_checklist_respostas`
Respostas do checklist técnico por OS.

| Coluna | Tipo |
|---|---|
| `os_id` | FK |
| `item` | VARCHAR(150) |
| `conforme` | BOOLEAN |
| `observacao` | VARCHAR(500) |

#### `os_medicoes`
Medições técnicas (uma por OS — UPSERT).

| Coluna | Tipo |
|---|---|
| `os_id` | FK UNIQUE |
| `temperatura_retorno` / `temperatura_insuflamento` | NUMERIC(7,2) |
| `tensao` / `corrente` | NUMERIC(8,2) |
| `pressao_baixa` / `pressao_alta` | NUMERIC(8,2) |
| `umidade` | NUMERIC(6,2) |
| `superaquecimento` / `subresfriamento` | NUMERIC(7,2) |
| `tipo_gas` | VARCHAR(50) |

#### `os_itens`
Serviços e peças utilizados na OS.

| Coluna | Tipo | Descrição |
|---|---|---|
| `os_id` | FK | — |
| `tipo` | VARCHAR | `PECA` / `SERVICO` |
| `referencia_id` | FK | `produtos.id` ou `catalogo_servicos.id` |
| `descricao` | VARCHAR(200) | — |
| `quantidade` | NUMERIC(10,2) | — |
| `valor_unitario` | NUMERIC(10,2) | — |
| `estoque_baixado` | BOOLEAN | Marcado ao finalizar OS |

#### `os_pausas`
Registro individual de cada pausa durante um atendimento.

| Coluna | Tipo |
|---|---|
| `os_id` / `usuario_id` | FKs |
| `motivo` | VARCHAR(300) |
| `iniciado_em` / `retomado_em` | TIMESTAMPTZ |

---

### Catálogo e Estoque

#### `catalogo_servicos`
Serviços oferecidos pela empresa.

| Coluna | Tipo |
|---|---|
| `empresa_id` | FK |
| `nome` | VARCHAR(150) |
| `descricao` | TEXT |
| `preco` / `custo` | NUMERIC(10,2) |
| `garantia_dias` | INTEGER |
| `duracao_minutos` | INTEGER |
| `categoria` | VARCHAR(100) |
| `ativo` | BOOLEAN |

#### `produtos`
Peças e insumos com controle de estoque.

| Coluna | Tipo |
|---|---|
| `empresa_id` | FK |
| `nome` | VARCHAR(150) |
| `sku` | VARCHAR(80) UNIQUE por empresa |
| `codigo_barras` | VARCHAR(80) |
| `marca` / `fornecedor` / `categoria` | VARCHAR |
| `unidade` | VARCHAR(20) DEFAULT 'UN' |
| `localizacao` | VARCHAR(120) |
| `custo` / `preco` | NUMERIC(10,2) |
| `estoque` / `estoque_minimo` | NUMERIC(12,2) |
| `ativo` | BOOLEAN |

#### `estoque_movimentos`
Histórico completo de entradas e saídas.

| Coluna | Tipo |
|---|---|
| `empresa_id` / `produto_id` | FKs |
| `os_id` / `tecnico_id` / `usuario_id` | FKs (nullable) |
| `tipo` | `ENTRADA` / `SAIDA` / `AJUSTE` |
| `quantidade` | NUMERIC(12,2) |
| `observacao` | VARCHAR(300) |

#### `estoque_tecnico`
Estoque individual por técnico (material no veículo).

| Coluna | Tipo |
|---|---|
| `tecnico_id` / `produto_id` | FKs (PK composta) |
| `quantidade` | NUMERIC(12,2) |

#### `estoque_reservas`
Reservas de peças para ordens de serviço específicas.

| Coluna | Tipo |
|---|---|
| `os_id` / `produto_id` / `tecnico_id` | FKs |
| `status` | `RESERVADO` / `ENTREGUE` / `CONSUMIDO` / `CANCELADO` |
| `quantidade` | NUMERIC(12,2) |
| `entregue_em` / `consumido_em` | TIMESTAMPTZ |

---

### Financeiro

#### `orcamentos`
| Coluna | Tipo |
|---|---|
| `empresa_id` / `cliente_id` / `aparelho_id` | FKs |
| `criado_por` | FK usuarios |
| `status` | `RASCUNHO` / `ENVIADO` / `APROVADO` / `RECUSADO` / `EXPIRADO` / `CONVERTIDO` |
| `validade` | DATE |
| `subtotal` / `desconto` / `total` / `custo_total` | NUMERIC |
| `os_id` | FK (após conversão) |

#### `orcamento_itens`
| Coluna | Tipo |
|---|---|
| `orcamento_id` | FK |
| `tipo` | `SERVICO` / `PECA` |
| `referencia_id` | FK catálogo |
| `descricao` / `quantidade` / `valor_unitario` / `custo_unitario` | — |

#### `pagamentos`
| Coluna | Tipo |
|---|---|
| `empresa_id` / `os_id` | FKs |
| `forma` | `DINHEIRO` / `PIX` / `DEBITO` / `CREDITO` / `BOLETO` / `TRANSFERENCIA` |
| `valor` | NUMERIC |
| `pago_em` | TIMESTAMPTZ |
| `recebido_por` | FK usuarios |

---

### Suprimentos

#### `fornecedores`
| Coluna | Tipo |
|---|---|
| `empresa_id` | FK |
| `nome` / `cpf_cnpj` / `telefone` / `email` | — |
| `endereco` completo | — |
| `ativo` | BOOLEAN |

#### `compras` + `compra_itens`
| Coluna | Tipo |
|---|---|
| `empresa_id` / `fornecedor_id` / `criado_por` | FKs |
| `status` | `PEDIDO` / `RECEBIDO` / `CANCELADO` |
| `numero_documento` / `previsao` | — |
| `total` | NUMERIC |
| `recebido_em` | TIMESTAMPTZ |

---

### Contratos e Notificações

#### `contratos`
| Coluna | Tipo |
|---|---|
| `empresa_id` / `cliente_id` | FKs |
| `nome` | VARCHAR(150) |
| `status` | `ATIVO` / `PAUSADO` / `ENCERRADO` |
| `periodicidade_meses` | INTEGER (1-24) |
| `valor_mensal` | NUMERIC |
| `inicio` / `fim` | DATE |
| `proxima_visita` | DATE |

#### `contrato_aparelhos`
Relação N:N entre contratos e aparelhos.

#### `notificacoes`
| Coluna | Tipo |
|---|---|
| `empresa_id` / `usuario_id` | FKs |
| `tipo` / `titulo` / `mensagem` | — |
| `referencia_tipo` / `referencia_id` | Para link contextual |
| `lida` | BOOLEAN |

#### `dispositivos_push`
| Coluna | Tipo |
|---|---|
| `empresa_id` / `usuario_id` | FKs |
| `token` | VARCHAR(255) UNIQUE |
| `plataforma` | VARCHAR(20) |
| `ativo` | BOOLEAN |

---

### WhatsApp

#### `whatsapp_conversas`
| Coluna | Tipo | Descrição |
|---|---|---|
| `empresa_id` / `cliente_id` | FKs | — |
| `telefone` | VARCHAR(20) | Número normalizado |
| `bot_etapa` | VARCHAR(40) | `INICIO` / `AGUARDANDO_TIPO` / `ATENDIMENTO_CLIENTE` etc. |
| `bot_ativo` | BOOLEAN | FALSE quando humano assumiu |
| `fila_status` | VARCHAR(20) | `AUTOMACAO` / `ESPERA` / `ATENDENDO` |
| `atendente_id` | FK usuarios | — |
| `janela_atendimento_ate` | TIMESTAMPTZ | Janela 24h da Meta |
| `nao_lidas` | INTEGER | — |

#### `whatsapp_mensagens`
| Coluna | Tipo |
|---|---|
| `conversa_id` | FK |
| `whatsapp_id` | VARCHAR(150) UNIQUE |
| `direcao` | `ENTRADA` / `SAIDA` |
| `tipo` | `text` / `document` / etc. |
| `conteudo` | TEXT |

---

### LGPD

#### `lgpd_auditoria`
| Coluna | Tipo |
|---|---|
| `usuario_id` / `empresa_id` | INTEGER (sem FK — usuário pode ter sido removido) |
| `tipo` | `EXPORTACAO_DADOS` / `EXCLUSAO_DADOS` |
| `ip_origem` | VARCHAR(45) |
| `created_at` | TIMESTAMPTZ |

---

### Checklists Configuráveis

#### `checklist_modelos`
Modelos de checklist por tipo de serviço. `empresa_id IS NULL` = padrão global.

| Coluna | Tipo | Descrição |
|---|---|---|
| `empresa_id` | FK (nullable) | NULL = padrão global |
| `tipo_servico` | VARCHAR(30) | — |
| `item` | VARCHAR(150) | Nome do item |
| `ordem` | INTEGER | Ordem de exibição |
| `obrigatorio` | BOOLEAN | — |
| `exige_observacao_nao_conforme` | BOOLEAN | Justificativa obrigatória se NC |
| `exige_foto` | BOOLEAN | — |
| `medicao_campo` | VARCHAR(50) | Campo de medição associado |
| `valor_minimo` / `valor_maximo` | NUMERIC | Faixa aceitável |

**Checklists padrão inseridos na migration:**
- `LIMPEZA`: 5 itens
- `INSTALACAO`: 5 itens
- `REMOCAO`: 4 itens
- `PREVENTIVA`: 5 itens
- `PROBLEMA_TECNICO`: 5 itens

---

## Índices

| Índice | Tabela | Colunas |
|---|---|---|
| `idx_os_empresa` | ordens_servico | empresa_id |
| `idx_os_status` | ordens_servico | status |
| `idx_os_tecnico` | ordens_servico | tecnico_id |
| `idx_os_agenda` | ordens_servico | empresa_id, tecnico_id, agendado_para |
| `idx_os_pdf_storage_key` | ordens_servico | pdf_storage_key |
| `idx_fotos_os` | os_fotos | os_id |
| `idx_os_fotos_storage_key` | os_fotos | storage_key |
| `idx_os_fotos_client_uuid` | os_fotos | client_uuid |
| `idx_checklist_os` | os_checklist_respostas | os_id |
| `idx_itens_os` | os_itens | os_id |
| `idx_historico_os` | os_historico | os_id |
| `idx_produtos_empresa` | produtos | empresa_id, ativo |
| `idx_catalogo_empresa` | catalogo_servicos | empresa_id, ativo |
| `idx_orcamentos_empresa` | orcamentos | empresa_id, status |
| `idx_pagamentos_os` | pagamentos | os_id |
| `idx_push_usuario` | dispositivos_push | usuario_id, ativo |
| `idx_contratos_empresa` | contratos | empresa_id, status, proxima_visita |
| `idx_notificacoes_usuario` | notificacoes | empresa_id, usuario_id, lida, created_at |
| `idx_lgpd_auditoria_empresa` | lgpd_auditoria | empresa_id, created_at DESC |
| `ux_fila_tipo_uuid` | fila_sync (SQLite) | tipo, client_uuid |

---

## Patches Incrementais

| Arquivo | O que faz |
|---|---|
| `patches/001_senha_alterada_em.sql` | Adiciona coluna `senha_alterada_em` em `usuarios` |
| `patches/002_lgpd_auditoria.sql` | Cria tabela `lgpd_auditoria` com índice |
