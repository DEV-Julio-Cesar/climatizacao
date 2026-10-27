# 03 — API Backend

## Estrutura de Arquivos

```
server.js                    ← ponto de entrada (porta 3000)
src/
  app.js                     ← setup Express, middlewares, rotas
  routes/
    os.routes.js             ← ordens de serviço e fotos
    cadastro.routes.js       ← clientes e equipamentos
    financeiro.routes.js     ← catálogo, estoque, orçamentos, pagamentos
    suprimentos.routes.js    ← fornecedores, compras, reservas
    gestao.routes.js         ← notificações, contratos, relatórios, configurações
    whatsapp.routes.js       ← webhook e central de atendimento
  controllers/
    AuthController.js
    OsController.js
    os/
      OsAgendaController.js
      OsEventoController.js
      OsExecucaoController.js
      validarConflito.js
    FotoController.js
    CadastroController.js
    FinanceiroController.js
    CatalogoController.js
    SuprimentosController.js
    GestaoController.js
    WhatsAppController.js
    LgpdController.js
    EnderecoController.js
  models/
    OsModel.js               ← queries principais de OS
  middlewares/
    authMiddleware.js        ← JWT + verificação no banco
    permissaoMiddleware.js   ← RBAC por permissão
    requestLogger.js         ← logging estruturado de HTTP
  config/
    database.js              ← Pool PostgreSQL (max 10)
    upload.js                ← Multer + validação de magic bytes
    logger.js                ← logger JSON estruturado com mascaramento
  services/
    PdfService.js
    WhatsAppService.js
    WhatsAppBotService.js
    PushService.js
  validators/
    osValidator.js
    cadastroValidator.js
  database/
    migration.sql
    patches/
```

---

## Cadeia de Middlewares

Aplicados globalmente na ordem:

1. **X-Request-Id** — `crypto.randomUUID()`, rastreabilidade entre serviços
2. **Helmet** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options
3. **compression** — gzip nas respostas
4. **requestLogger** — loga método, rota, status, duração, usuario_id (JSON)
5. **CORS manual** — valida `Origin` contra `CORS_ORIGIN`, rejeita origens não listadas
6. **express.json** — parse JSON, limite 1 MB, salva `rawBody` para webhook
7. **express.urlencoded** — form data, limite 1 MB

---

## Rotas Públicas (sem autenticação)

```
POST /login                  → AuthController.login
POST /auth/refresh           → AuthController.refresh
GET  /health                 → { status: "ok", timestamp }
GET  /health/ready           → { status: "ready", database: "ok" }  (testa DB)
GET  /privacidade            → página HTML de política de privacidade
GET  /arquivos/fotos/:chave  → serve foto BYTEA do banco
GET  /arquivos/ordens/:chave.pdf → serve PDF BYTEA do banco
GET  /equipamentos/publico/:token → ficha pública do equipamento (QR Code)
GET  /webhooks/whatsapp      → verificação de webhook Meta
POST /webhooks/whatsapp      → receber mensagens (HMAC verificado)
GET  /painel/*               → SPA React (web/dist)
GET  /                       → JSON de identificação da API
```

---

## Autenticação

### POST /login

- Valida `{ email, senha }` com Zod (email válido, senha 6-200 chars)
- Busca usuário ativo (`ativo = TRUE AND deleted_at IS NULL`)
- Compara senha com `bcrypt.compare` (hash custo 12)
- Resolve permissões efetivas: perfil padrão + overrides de `usuario_permissoes`
- Gera par de tokens:
  - `accessToken`: JWT HS256, expira em 8h
  - `refreshToken`: JWT HS256, expira em 30 dias
- Retorna `token`, `refresh_token`, `usuario` (id, nome, perfil, empresa_id, permissoes), `expira_em`

### POST /auth/refresh

- Recebe `{ refresh_token }`
- Verifica assinatura e expiração do JWT
- Consulta banco: usuário ativo + `iat < senha_alterada_em` (invalida refresh emitido antes de troca de senha)
- Emite novo par de tokens (rotação de refresh token)

### authMiddleware (protege todas as rotas autenticadas)

Além da verificação JWT padrão, consulta o banco a cada requisição para:
- Confirmar que o usuário ainda está ativo e não foi deletado
- Verificar se o token foi emitido antes de uma troca de senha (`iat < senha_alterada_em`)

> Custo extra: 1 query simples por PK a cada requisição. Necessário para segurança imediata pós-troca de senha.

---

## Rotas Autenticadas — Ordens de Serviço

### Listagem

| Método | Rota | Controller | Permissão |
|---|---|---|---|
| GET | `/os/agenda` | OsAgendaController.listarAgenda | `AGENDA_VISUALIZAR` |
| GET | `/os/finalizadas` | OsAgendaController.listarFinalizadas | `AGENDA_VISUALIZAR` |
| GET | `/os/todas` | OsAgendaController.listarTodas | `AGENDA_VISUALIZAR` |
| GET | `/os/:id` | OsController.detalhes | `AGENDA_VISUALIZAR` |

**`GET /os/agenda`** — aceita query params:
- `filtro`: `HOJE` (default) / `ATRASADAS` / `PROXIMAS` / `TODAS`
- `busca`: texto livre (nome do cliente, ID da OS, endereço)

**`GET /os/:id`** — retorna OS completa com:
- Dados do cliente (endereço, lat/lon)
- Dados do técnico e aparelho
- `historico_equipamento` (últimas 10 OS finalizadas do aparelho)
- `checklist` (respostas preenchidas)
- `medicoes` (dados técnicos)
- `itens` (peças e serviços)
- `fotos` (sem conteúdo BYTEA — apenas metadados e URL)
- `linha_tempo` (histórico de status)
- `checklist_modelo` (modelo configurado para o tipo de serviço)

### Criação e Ciclo de Vida

| Método | Rota | Controller | Permissão |
|---|---|---|---|
| POST | `/os` | OsController.criar | `OS_CRIAR` |
| PATCH | `/os/:id/status` | OsController.atualizarStatus | `OS_EXECUTAR` |
| PATCH | `/os/:id/reagendar` | OsController.reagendar | `OS_REAGENDAR` |
| PATCH | `/os/:id/execucao` | OsExecucaoController.salvarExecucao | `OS_EXECUTAR` |
| POST | `/os/:id/eventos` | OsEventoController.registrarEvento | `OS_EXECUTAR` |
| POST | `/os/:id/retorno` | OsEventoController.criarRetorno | `OS_EXECUTAR` |
| PATCH | `/os/:id/agendar` | OsEventoController.agendarVisita | `OS_EXECUTAR` |

**Validadores Zod para OS:**

- `POST /os`: campos obrigatórios (`cliente_id`, `tipo_servico`, `descricao_problema`), opcionais (`aparelho_id`, `agendado_para`, `duracao_prevista_minutos`, `valor_total`)
- `PATCH /os/:id/status`: `novo_status` deve ser `ABERTA` / `EM_ANDAMENTO` / `FINALIZADA` / `CANCELADA`
- `POST /os/:id/eventos`: `evento` enum (`A_CAMINHO`, `CHECKIN`, `CHECKOUT`, `PAUSAR`, `RETOMAR`); GPS obrigatório em CHECKIN e CHECKOUT
- `PATCH /os/:id/execucao`: `diagnostico` e `solucao_aplicada` (mín. 5 chars), `checklist` array (mín. 1), `medicoes` objeto, `itens` array (máx. 100)

**Verificação de conflito de agenda** (`validarConflito.js`):
- Usa `tstzrange` do PostgreSQL para detectar sobreposição de horários
- Aplicada em `criar` e `reagendar`
- Bloqueia se o técnico já tiver OS `ABERTA` ou `EM_ANDAMENTO` no mesmo horário

### Fotos

| Método | Rota | Controller | Permissão |
|---|---|---|---|
| POST | `/os/fotos` | FotoController.upload | `OS_EXECUTAR` |
| DELETE | `/os/fotos/:id` | FotoController.remover | `OS_EXECUTAR` |

**`POST /os/fotos`** (multipart/form-data):
- Campos: `os_id`, `tipo`, `imagem` (arquivo), `comentario` (opt), `latitude`, `longitude`, `capturada_em`, `client_uuid`
- Validações: OS deve estar `EM_ANDAMENTO`; DEPOIS exige ANTES; ASSINATURA exige DEPOIS
- Deduplicação: se `client_uuid` já existe → retorna foto existente (200)
- Armazena `conteudo BYTEA` no PostgreSQL

---

## Rotas Autenticadas — Cadastros

| Método | Rota | Descrição |
|---|---|---|
| GET | `/clientes` | Lista clientes com aparelhos (JSON agregado) |
| GET | `/clientes/:id` | Detalhe com OS anteriores |
| POST | `/clientes` | Criar cliente |
| PATCH | `/clientes/:id` | Atualizar |
| DELETE | `/clientes/:id` | Soft delete |
| GET | `/equipamentos/:id` | Ficha técnica + histórico |
| POST | `/equipamentos` | Criar equipamento |
| PATCH | `/equipamentos/:id` | Atualizar |
| DELETE | `/equipamentos/:id` | Soft delete |
| GET | `/equipamentos/:id/qrcode` | PNG do QR Code (base64) |
| GET | `/equipamentos-alertas` | Aparelhos com manutenção vencida/próxima |
| GET | `/tecnicos` | Lista técnicos ativos da empresa |
| GET | `/enderecos/cep/:cep` | Busca CEP via ViaCEP |

---

## Rotas Autenticadas — Financeiro e Catálogo

| Método | Rota | Descrição |
|---|---|---|
| GET | `/catalogo` | Produtos e serviços ativos (para mobile) |
| GET | `/catalogo/gestao` | Com custo (para web/gestor) |
| POST | `/catalogo` | Criar item |
| PATCH | `/catalogo/servicos/:id` | Atualizar serviço |
| DELETE | `/catalogo/servicos/:id` | Inativar serviço |
| PATCH | `/catalogo/produtos/:id` | Atualizar produto |
| DELETE | `/catalogo/produtos/:id` | Inativar produto |
| GET | `/produtos/:id/movimentacoes` | Histórico de estoque |
| POST | `/produtos/:id/movimentar` | Entrada/saída/ajuste manual |
| GET | `/estoque/tecnicos` | Estoque por técnico |
| POST | `/produtos/:id/transferir-tecnico` | Transferir para técnico |
| POST | `/produtos/:id/devolver-tecnico` | Devolver ao estoque central |
| GET | `/orcamentos` | Lista orçamentos |
| POST | `/orcamentos` | Criar orçamento |
| GET | `/orcamentos/:id` | Detalhe com itens |
| GET | `/orcamentos/:id/pdf` | PDF do orçamento |
| POST | `/orcamentos/:id/whatsapp` | Enviar por WhatsApp |
| PATCH | `/orcamentos/:id/status` | Aprovar/recusar/expirar |
| POST | `/orcamentos/:id/converter` | Converter em OS |
| POST | `/os/:id/pagamentos` | Registrar pagamento |
| GET | `/financeiro/dashboard` | KPIs financeiros |

---

## Rotas Autenticadas — Suprimentos

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/fornecedores` | Listar e criar |
| PATCH | `/fornecedores/:id` | Atualizar |
| GET | `/compras` | Listar pedidos |
| GET | `/compras/:id` | Detalhe |
| POST | `/compras` | Criar pedido |
| POST | `/compras/:id/receber` | Receber (atualiza estoque) |
| POST | `/compras/:id/cancelar` | Cancelar |
| GET | `/estoque/reservas` | Listar reservas |
| POST | `/estoque/reservas` | Reservar peça para OS |
| POST | `/estoque/reservas/:id/entregar` | Marcar como entregue |
| POST | `/estoque/reservas/:id/cancelar` | Cancelar |

---

## Rotas Autenticadas — Gestão

| Método | Rota | Descrição |
|---|---|---|
| GET | `/notificacoes` | Notificações do usuário |
| PATCH | `/notificacoes/:id/ler` | Marcar lida |
| POST | `/dispositivos/push` | Registrar token push |
| GET | `/contratos` | Listar contratos |
| POST | `/contratos` | Criar contrato |
| POST | `/contratos/:id/gerar-visita` | Gerar OS de manutenção preventiva |
| GET | `/relatorios/gerencial` | KPIs dos últimos 90 dias |
| GET | `/agenda/gestao` | Agenda de toda a empresa |
| GET | `/configuracoes/permissoes` | Usuários + overrides |
| PUT | `/configuracoes/usuarios/:id/permissoes` | Salvar permissões |
| GET | `/configuracoes/tecnicos` | Lista técnicos |
| POST | `/configuracoes/tecnicos` | Cadastrar técnico |
| GET | `/configuracoes/checklists/:tipo` | Checklist por tipo |
| PUT | `/configuracoes/checklists/:tipo` | Salvar checklist customizado |

---

## Rotas Autenticadas — WhatsApp

| Método | Rota | Descrição |
|---|---|---|
| GET | `/atendimento/whatsapp/conversas` | Lista conversas (3 filas) |
| GET | `/atendimento/whatsapp/conversas/:id` | Mensagens de uma conversa |
| POST | `/atendimento/whatsapp/conversas/:id/mensagens` | Enviar mensagem |
| PATCH | `/atendimento/whatsapp/conversas/:id/fila` | Mover entre filas |
| POST | `/atendimento/whatsapp/conversas/:id/assumir` | Humano assume |
| POST | `/atendimento/whatsapp/conversas/:id/encerrar` | Encerrar atendimento |

---

## Rotas de Conta (LGPD)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/conta/senha` | Trocar senha (invalida tokens) |
| GET | `/conta/dados` | Exportar dados pessoais (Art. 18-II) |
| DELETE | `/conta/dados` | Anonimizar dados (Art. 18-VI) |

---

## Services

### PdfService

Gera PDFs com `pdfkit`:
- **`gerarOsPdf(os, fotos)`**: relatório completo de OS com logomarca, dados da empresa, cliente, aparelho, checklist, medições, itens, fotos embutidas e assinatura
- **`gerarOrcamentoPdf(orcamento)`**: orçamento com itens, valores, desconto, total, validade

### WhatsAppService

Integração com Meta WhatsApp Cloud API v24.0:
- **`enviarMensagem(telefone, texto)`**: texto simples
- **`enviarPdfOs(telefone, nomeCliente, urlPdf)`**: template `os_finalizada` com PDF
- **`enviarDocumento(telefone, buffer, filename, caption)`**: upload de mídia + envio
- Normaliza número: adiciona DDI 55, insere 9º dígito se necessário

### WhatsAppBotService

Bot automático de triagem com etapas:
- `INICIO` → saudação + menu
- `AGUARDANDO_TIPO` → aguarda escolha (cliente/novo contato)
- `ATENDIMENTO_CLIENTE` → fluxo do cliente existente
- `NOVO_CONTATO` → captura dados para cadastro

### PushService

Notificações push via Expo Push API:
- Busca tokens ativos em `dispositivos_push`
- Envia lote para `https://exp.host/--/api/v2/push/send`
- Falha silenciosa — não derruba a API

---

## Logger

`src/config/logger.js` — emite JSON por linha em stdout/stderr:

```json
{"nivel":"info","timestamp":"2026-10-20T10:00:00.000Z","mensagem":"http","metodo":"POST","rota":"/os","status":201,"duracao_ms":45,"usuario_id":3,"empresa_id":1}
```

Campos mascarados automaticamente: `senha`, `senha_hash`, `token`, `refresh_token`, `authorization`, `cpf`, `cpf_cnpj`, `telefone`, `email`, `whatsapp_access_token`.

Níveis: `debug` < `info` < `aviso` < `erro`. Configurável via `LOG_LEVEL`.
