# 04 — Fluxo Completo de uma Ordem de Serviço

Documenta o caminho de ponta a ponta de uma OS, desde a criação até o envio do relatório ao cliente.

---

## Diagrama Resumido

```
[Gestor/Técnico]                [API]                      [Banco]
      │                           │                            │
      │── POST /os ───────────────►│ validar relacionamentos    │
      │                           │── INSERT ordens_servico ──►│
      │                           │── INSERT os_historico ─────►│
      │◄── 201 { os } ────────────│                            │
      │                           │── PUSH notification ──────►[Técnico]
      │
[Técnico no campo]
      │── POST /os/:id/eventos (A_CAMINHO) ──►│── UPDATE a_caminho_em
      │── POST /os/:id/eventos (CHECKIN) ─────►│── UPDATE status=EM_ANDAMENTO + GPS
      │                                         │── INSERT os_historico
      │── POST /os/fotos (ANTES) ───────────────►│── INSERT os_fotos (BYTEA)
      │── POST /os/fotos (EVIDENCIA) ─────────►│
      │── PATCH /os/:id/execucao ───────────────►│── UPDATE diagnóstico, checklist, medições, itens
      │── POST /os/fotos (ASSINATURA) ──────────►│
      │── POST /os/:id/eventos (CHECKOUT) ─────►│── UPDATE checkout + GPS
      │── PATCH /os/:id/status (FINALIZADA) ───►│── baixar estoque
      │                                         │── gerar PDF (pdfkit)
      │                                         │── UPDATE pdf_conteudo, pdf_url
      │◄── 200 { os, pdf_url } ─────────────────│
      │                                         │── WhatsApp: template os_finalizada ──►[Cliente]
```

---

## Passo 1 — Criação da OS

**Quem**: gestor ou técnico (via mobile ou web)

**Endpoint**: `POST /os`

**Campos obrigatórios:**
- `cliente_id` — cliente cadastrado na empresa
- `tipo_servico` — `LIMPEZA` / `INSTALACAO` / `REMOCAO` / `PREVENTIVA` / `PROBLEMA_TECNICO`
- `descricao_problema` — texto descritivo

**Campos opcionais:**
- `aparelho_id` — equipamento específico do cliente
- `tecnico_id` — gestor pode atribuir a outro técnico
- `agendado_para` — data/hora ISO 8601
- `duracao_prevista_minutos` (default 120)
- `valor_total`

**O que acontece no backend:**
1. Valida relacionamentos (cliente ativo, técnico ativo, aparelho pertence ao cliente)
2. Verifica conflito de agenda para o técnico usando `tstzrange` do PostgreSQL
3. Insere OS com `status = 'ABERTA'`
4. Registra histórico: `NULL → ABERTA`
5. Dispara push notification para o técnico (sem bloquear a resposta)

**Offline mobile:** se sem internet, salva na fila SQLite como `CRIAR_OS`.

---

## Passo 2 — Técnico a Caminho

**Endpoint**: `POST /os/:id/eventos` `{ "evento": "A_CAMINHO" }`

- Registra `a_caminho_em = NOW()`
- Status permanece `ABERTA`
- Histórico registrado

---

## Passo 3 — Check-in no Local

**Endpoint**: `POST /os/:id/eventos` `{ "evento": "CHECKIN", "latitude": X, "longitude": Y }`

- Status muda para `EM_ANDAMENTO`
- Registra `checkin_em`, `checkin_latitude`, `checkin_longitude`
- Registra `iniciado_em` (se ainda não preenchido)
- Histórico: `ABERTA → EM_ANDAMENTO`

**Pré-requisito de estado**: OS deve estar `ABERTA`.

---

## Passo 4 — Registro Fotográfico (obrigatório)

**Sequência obrigatória de tipos:**
1. `ANTES` — estado antes do serviço
2. `DEPOIS` — resultado após o serviço (exige ANTES)
3. `ASSINATURA` — assinatura do cliente (exige DEPOIS)
4. `EVIDENCIA` — fotos adicionais (qualquer momento)

**Endpoint**: `POST /os/fotos` (multipart/form-data)

**No mobile (`CameraOS.js`):**
- Câmera `expo-camera`, resolução reduzida para 1200px, qualidade 0.7
- Compressão com `expo-image-manipulator`
- GPS capturado com `expo-location`
- Se online: upload imediato para a API
- Se offline: copia arquivo para `FileSystem.documentDirectory`, enfileira `FOTO_OS` no SQLite

**No backend (`FotoController.js`):**
- Valida magic bytes do buffer (MIME spoofing protection)
- OS deve estar `EM_ANDAMENTO`
- Verifica sequência obrigatória
- Idempotência: `client_uuid` já existente → retorna foto existente (HTTP 200)
- Armazena `conteudo BYTEA` no PostgreSQL
- URL de acesso: `GET /arquivos/fotos/:storage_key`

---

## Passo 5 — Pausas (opcional)

**Pausar**: `POST /os/:id/eventos` `{ "evento": "PAUSAR", "motivo": "Aguardando peça" }`
- Insere em `os_pausas`
- Registra `pausado_em = NOW()`

**Retomar**: `POST /os/:id/eventos` `{ "evento": "RETOMAR" }`
- Fecha pausa em `os_pausas`
- Acumula `total_pausa_segundos += EXTRACT(EPOCH FROM (NOW() - pausado_em))`
- Limpa `pausado_em = NULL`

---

## Passo 6 — Relatório Técnico

**Endpoint**: `PATCH /os/:id/execucao`

**Campos obrigatórios:**
- `diagnostico` (mín. 5 chars)
- `solucao_aplicada` (mín. 5 chars)
- `checklist` — array com pelo menos 1 item
- `itens` — array de peças/serviços (pode ser vazio)
- `medicoes` — objeto com campos opcionais

**Validações do backend (`OsExecucaoController.js`):**
1. OS deve ter ≥ 2 fotos do tipo `ANTES`, `DEPOIS` ou `EVIDENCIA`
2. Cada item do checklist é validado contra o modelo configurado:
   - Item obrigatório não respondido → erro 422
   - Não-conforme sem justificativa → erro 422 (se `exige_observacao_nao_conforme`)
   - Medição fora da faixa `[valor_minimo, valor_maximo]` → erro 422
3. Verifica estoque disponível para peças referenciadas

**O que é salvo (em transação):**
- `diagnostico`, `solucao_aplicada`, `recomendacoes`, `garantia_dias`, `retorno_necessario`, `valor_total`
- Apaga e reinseire checklist (`os_checklist_respostas`)
- UPSERT nas medições (`os_medicoes`)
- Apaga e reinseire itens (`os_itens`)

---

## Passo 7 — Coleta de Assinatura

**Tela**: `AssinaturaOS.js` (React Native Signature Canvas)

**Fluxo:**
1. Cliente assina no canvas
2. Canvas gera PNG base64
3. Salvo em cache local
4. `POST /os/fotos` (tipo `ASSINATURA`) — upload da assinatura

---

## Passo 8 — Check-out com GPS

**Endpoint**: `POST /os/:id/eventos` `{ "evento": "CHECKOUT", "latitude": X, "longitude": Y }`

- Registra `checkout_em`, `checkout_latitude`, `checkout_longitude`
- Status permanece `EM_ANDAMENTO`

**Pré-requisito**: OS deve estar `EM_ANDAMENTO`.

---

## Passo 9 — Finalização

**Endpoint**: `PATCH /os/:id/status` `{ "novo_status": "FINALIZADA" }`

### Validações antes de finalizar (`_validarPreRequisitosFinalizacao`):

| Condição | Erro |
|---|---|
| `diagnostico` vazio | 422 |
| `solucao_aplicada` vazia | 422 |
| Nenhuma foto tipo `ASSINATURA` | 422 |
| Menos de 2 fotos (ANTES/DEPOIS/EVIDENCIA) | 422 |
| Nenhuma resposta de checklist | 422 |
| `checkout_em` não preenchido | 422 |

### Baixa de estoque (`_baixarEstoque`):

Para cada item de peça (`tipo = 'PECA'` e `estoque_baixado = FALSE`):
1. Verifica disponibilidade: estoque do técnico (se tiver `estoque_tecnico`) OU estoque central
2. Se insuficiente → erro 422
3. Decrementa estoque (`FOR UPDATE OF p` — lock pessimista)
4. Insere em `estoque_movimentos` (`tipo = 'SAIDA'`)
5. Marca `estoque_baixado = TRUE` em `os_itens`
6. Marca reservas como `CONSUMIDO`

### Atualização de status (em transação):
- `status = 'FINALIZADA'`
- `finalizado_em = NOW()`
- Histórico: `EM_ANDAMENTO → FINALIZADA`

### Geração de PDF (`_gerarEPersistirPdf`) — fora da transação:
1. Busca dados completos (OS + cliente + empresa + técnico)
2. Busca fotos, checklist, medições, itens em paralelo (`Promise.all`)
3. `PdfService.gerarOsPdf(dados, fotos)` → Buffer PDF
4. Gera `pdf_storage_key = randomUUID()`
5. `pdf_url = ${APP_URL}/arquivos/ordens/${storage_key}.pdf`
6. `UPDATE ordens_servico SET pdf_conteudo = $1, pdf_url = $2...`
7. Se cliente tem telefone e WhatsApp configurado: envia template `os_finalizada` com PDF

> **Nota**: geração de PDF é melhor-esforço. Se falhar, a OS continua finalizada e um aviso é logado.

---

## Passo 10 — Pós-Finalização

- **`pdf_url`** retornado na resposta da finalização
- **WhatsApp**: cliente recebe PDF automaticamente (se WhatsApp estiver configurado)
- **Web**: OS aparece em "O.S. Finalizadas" no `PainelDespacho`
- **Pagamento**: gestor registra `POST /os/:id/pagamentos`

---

## Retorno / Segunda Visita

Durante o `salvarExecucao` ou após finalizar, se `retorno_necessario = true`:

**Endpoint**: `POST /os/:id/retorno` `{ "agendado_para": "...", "motivo": "..." }`

Cria nova OS com:
- Mesmo cliente, aparelho, técnico, tipo de serviço
- `retorno_de_os_id = id_da_os_pai`
- Status `ABERTA`
- Atualiza OS pai com `situacao_pendencia = 'RETORNO_AGENDADO'`

---

## Sincronização Offline (Mobile)

Quando o técnico está sem internet, o `SyncService.js` processa a fila SQLite ao reconectar:

| Tipo | Endpoint chamado |
|---|---|
| `CRIAR_OS` | `POST /os` |
| `STATUS_OS` | `PATCH /os/:id/status` |
| `EVENTO_OS` | `POST /os/:id/eventos` |
| `EXECUCAO_OS` | `PATCH /os/:id/execucao` |
| `RETORNO_OS` | `POST /os/:id/retorno` |
| `AGENDAR_OS` | `PATCH /os/:id/agendar` |
| `FOTO_OS` | `POST /os/fotos` + deleta arquivo local |

**Idempotência garantida por:**
- `client_uuid` no payload → servidor ignora duplicatas
- Índice único `(tipo, client_uuid)` no SQLite local
- Resposta 409 "já processado" = tratado como sucesso

**Estratégia de erro:**
- Erro 4xx → marca falha, continua para o próximo item
- Erro 5xx ou rede → para o loop (não martela o servidor)
- Máximo de tentativas rastreado em `fila_sync.tentativas`
