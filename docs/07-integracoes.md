# 07 — Integrações Externas

---

## WhatsApp — Meta Cloud API

**Versão:** v24.0  
**Arquivos:** `src/services/WhatsAppService.js`, `src/controllers/WhatsAppController.js`, `src/services/WhatsAppBotService.js`, `src/services/WhatsAppAutomacaoService.js`, `src/services/WhatsAppBotWorker.js` e `src/controllers/WhatsAppAutomacaoController.js`

### Configuração

Variáveis de ambiente necessárias:

```env
WHATSAPP_PHONE_NUMBER_ID=       # ID do número de telefone da empresa
WHATSAPP_BUSINESS_ACCOUNT_ID=   # ID da conta business
WHATSAPP_ACCESS_TOKEN=          # Token de acesso permanente
WHATSAPP_VERIFY_TOKEN=          # Token de verificação do webhook
WHATSAPP_APP_SECRET=            # Secret para verificação HMAC
WHATSAPP_EMPRESA_ID=            # ID da empresa que recebe os webhooks
WHATSAPP_GRAPH_VERSION=v24.0
```

### Funcionalidades implementadas

#### 1. Envio automático ao finalizar OS
Após a finalização, o worker persistente gera o PDF e tenta enviar quando há telefone e conta WhatsApp configurada:
```
Template: os_finalizada
Header: documento (PDF da OS)
Body: mensagem com nome do cliente
```
O PDF é enviado diretamente como documento com o relatório completo.

#### 2. Envio de orçamentos
`POST /orcamentos/:id/whatsapp` envia o PDF do orçamento para o cliente:
```
Template: orcamento
Header: documento (PDF do orçamento)
```

#### 3. Webhook de recebimento
`POST /webhooks/whatsapp` — recebe mensagens dos clientes:
- Exige assinatura HMAC com `WHATSAPP_APP_SECRET`; sem segredo não processa entradas
- Extrai telefone, mensagem e nome do contato
- Persiste entrada, triagem e resposta pendente em transação antes do 200; o worker envia depois

#### 4. Bot automático (`WhatsAppBotService`)
Etapas do fluxo automático:

| Etapa | Trigger | Ação |
|---|---|---|
| `INICIO` | Primeira mensagem | Saudação + menu de opções |
| `AGUARDANDO_SERVICO` | Menu | Limpeza, instalação, reparo, orçamento ou outro assunto |
| `AGUARDANDO_NOME` | Serviço escolhido ou identificado no texto | Pergunta nome sem documentos |
| `AGUARDANDO_LOCALIDADE` | Nome informado | Cidade/bairro; financeiro/outros pula essa etapa |
| `AGUARDANDO_DESCRICAO` | Localidade informada | Resumo do pedido |
| `AGUARDANDO_ATENDENTE` | Triagem pronta, opção 0, mídia ou respostas inválidas | Espera humana com bot desativado |

Gestores configuram os textos e simulam a jornada no painel. Não cria cadastro/OS nem confirma preço ou agendamento. O horário configurado é informativo. Fluxos antigos recebem migração de etapa na próxima entrada. Veja [recepção e operação](./22-whatsapp-recepcao.md).

#### 5. Central de atendimento humano
- Atendente assume a conversa: `bot_ativo = FALSE`, invalida respostas pendentes antigas e prepara uma saudação como rascunho; não envia automaticamente
- Fila visual com 3 estados: Automação / Espera / Atendendo
- Janela de 24h da Meta rastreada via `janela_atendimento_ate`
- Envio de mensagens livres pelo atendente responsável enquanto dentro da janela; encerramento interno não envia despedida automática

#### 6. Normalização de números
```javascript
// Exemplos:
// "84988986845" → "5584988986845"    (adiciona DDI 55)
// "8488986845"  → "55848988986845"   (adiciona DDI + 9º dígito)
```

### Roteamento multiempresa
O webhook identifica a empresa pelo `phone_number_id` destinatário em `empresas_whatsapp`, e só então busca o cliente nessa empresa. `token_env` referencia uma variável `WHATSAPP_ACCESS_TOKEN_*`, sem token em texto no banco. O par legado explícito `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_EMPRESA_ID` permanece compatível. Saídas usam `WhatsAppContaService`; configuração/homologação na Meta continuam necessárias.

---

## Expo Push Notifications

**Arquivo:** `src/services/PushService.js` (backend), `mobile/src/services/notifications.js` (mobile)

### Fluxo

1. **Mobile:** ao logar, solicita permissão de notificação
2. Obtém `ExponentPushToken` via `expo-notifications`
3. `POST /dispositivos/push { token, plataforma }` → salvo em `dispositivos_push`
4. **Backend:** ao criar/reagendar OS, chama `PushService.enviar(tecnicoId, titulo, corpo, dados)`
5. Busca tokens ativos do técnico em `dispositivos_push`
6. Envia para `https://exp.host/--/api/v2/push/send`

### Eventos que disparam push

| Evento | Destinatário | Mensagem |
|---|---|---|
| OS criada | Técnico atribuído | "Nova ordem de serviço — A O.S. #X foi atribuída a você." |
| OS reagendada | Técnico atribuído | "Atendimento reagendado — A O.S. #X foi incluída na sua agenda." |
| Retorno criado | Técnico | "Visita de retorno — Retorno #X agendado." |
| Visita agendada | Técnico | "Visita agendada — A O.S. #X foi agendada." |

### Configurações Android
- Canal `climasaas-atendimentos` com vibração habilitada
- Ícone padrão do app

### Falha silenciosa
Se o envio de push falhar (token inválido, serviço indisponível), a operação principal **não é interrompida** — apenas um log de aviso é emitido.

---

## Google Maps / Apple Maps

**Arquivo:** `mobile/src/screens/Agenda/MapaAtendimento.js`

Integração via deep link nativo — **não usa SDK**, apenas abre o app de mapas instalado no celular:

```javascript
// Android — Google Maps
`geo:${lat},${lon}?q=${lat},${lon}(${nome_cliente})`

// iOS — Apple Maps
`maps:?q=${lat},${lon}`

// iOS com Google Maps preferido
`comgooglemaps://?daddr=${lat},${lon}`
```

Vantagem: sem custo de API Key, sem SDK nativo adicional. Desvantagem: não controla o app de mapas que será aberto.

---

## OpenStreetMap (react-leaflet)

**Arquivo:** `web/src/pages/MapaEquipe.jsx`

- Tiles do OpenStreetMap: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Biblioteca `react-leaflet` + `leaflet`
- Sem API Key necessária
- Marcadores customizados por status de OS

**Mobile:** `react-native-maps` renderiza mapa nativo (Google Maps no Android, Apple Maps no iOS). Configurado com `GOOGLE_MAPS_API_KEY` no `app.config.js`.

---

## ViaCEP

**Arquivo:** `src/controllers/EnderecoController.js`

Endpoint proxy que consulta a API pública do ViaCEP:

```
GET /enderecos/cep/:cep
→ GET https://viacep.com.br/ws/:cep/json/
→ retorna: logradouro, bairro, cidade, estado
```

Usado em:
- `ClienteForm` (mobile) — preenche endereço ao digitar CEP
- `Clientes.jsx` (web) — idem

---

## PostgreSQL via Neon

**Arquivo:** `src/config/database.js`

- Driver `pg` (node-postgres)
- Pool de 10 conexões máximas
- Timeout de conexão: 5s
- Timeout de idle: 30s
- SSL obrigatório em produção (`rejectUnauthorized: true`)
- Controlável via `DB_SSL_REJECT_UNAUTHORIZED=false` para ambientes sem certificado válido
- Helper `transaction(callback)` para transações automáticas com ROLLBACK em erro

**Neon:** banco PostgreSQL serverless. URL inclui `?sslmode=require`. Usa pooler de conexões para compatibilidade com ambiente serverless/stateless do Render.

---

## PDF (pdfkit)

**Arquivo:** `src/services/PdfService.js`

Geração de PDFs em memória com `pdfkit`:

### `gerarOsPdf(os, fotos)`
Estrutura do relatório:
1. Cabeçalho com nome da empresa
2. Dados da OS (número, tipo, data, técnico)
3. Dados do cliente e endereço
4. Dados do equipamento (marca, modelo, BTUs, série)
5. Descrição do problema, diagnóstico e solução
6. Checklist com itens e conformidade
7. Medições técnicas (tabela)
8. Peças e serviços utilizados (com valores)
9. Fotos de evidência embutidas (JPEG inline)
10. Assinatura do cliente
11. Rodapé com garantia e recomendações

### `gerarOrcamentoPdf(orcamento)`
1. Cabeçalho da empresa
2. Dados do cliente e equipamento
3. Tabela de itens com quantidades e valores
4. Subtotal, desconto e total
5. Condições e validade
6. Observações

Os PDFs são armazenados como `BYTEA` no banco — sem dependência de serviço de storage externo.

---

## QR Code (qrcode)

**Arquivo:** `src/controllers/CadastroController.js`

Geração de QR Code para equipamentos via biblioteca `qrcode`:

- URL gerada: `climasaas://equipamento/${aparelho.public_id}` (deep link para o app mobile)
- Retornado como PNG base64 ou data URI
- `public_id` é um UUID gerado automaticamente (`uuid_generate_v4()`) ao criar o aparelho
- Endpoint público: `GET /equipamentos/publico/:token` — retorna dados do equipamento sem autenticação
