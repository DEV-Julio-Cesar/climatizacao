# Análise de Qualidade — ClimaSaaS

---

## 1. O que compõe esse software?

O ClimaSaaS é uma plataforma SaaS multi-tenant para empresas de climatização. É composto por três camadas independentes que se comunicam via API REST:

### API Backend (`/src`)
- **Runtime**: Node.js 22 + Express 4
- **Banco de dados**: PostgreSQL (Neon em produção)
- **Responsabilidade**: toda a regra de negócio do sistema
- **Componentes internos**:
  - `app.js` — setup do Express: middlewares globais, CORS, Helmet, Rate Limiting, rotas públicas
  - `routes/` — 6 arquivos de rotas modulares: `os.routes.js`, `cadastro.routes.js`, `financeiro.routes.js`, `gestao.routes.js`, `whatsapp.routes.js`, `suprimentos.routes.js`
  - `controllers/` — 12 controllers: `AuthController`, `OsController`, `FotoController`, `CadastroController`, `FinanceiroController`, `CatalogoController`, `SuprimentosController`, `GestaoController`, `WhatsAppController`, `LgpdController`, `EnderecoController` + subcontrollers em `controllers/os/` (OsAgendaController, OsEventoController, OsExecucaoController, validarConflito)
  - `models/OsModel.js` — queries SQL centralizadas para ordens de serviço
  - `middlewares/` — `authMiddleware.js` (JWT + consulta ao banco), `permissaoMiddleware.js` (RBAC), `requestLogger.js` (logging estruturado)
  - `services/` — `PdfService.js` (geração com pdfkit), `WhatsAppService.js` (Meta Cloud API v24), `WhatsAppBotService.js` (bot de triagem), `PushService.js` (Expo Push API)
  - `config/` — `database.js` (Pool pg, max 10), `upload.js` (Multer memória, 8 MB, magic bytes), `logger.js` (JSON estruturado com mascaramento)
  - `validators/` — `osValidator.js`, `cadastroValidator.js` (Zod)
  - `database/` — `migration.sql` + patches incrementais

### App Mobile (`/mobile`)
- **Runtime**: React Native 0.86 + Expo SDK 57
- **Público-alvo**: técnicos de campo
- **Componentes internos**:
  - `App.js` — entry point, setup de navegação e contexto de autenticação
  - `navigation/` — Stack + Bottom Tabs com React Navigation
  - `screens/` — Login, Agenda (lista + mapa), OS (CameraOS, Checklist, AssinaturaOS, detalhes, execução), Configurações
  - `services/api.js` — cliente HTTP com refresh automático de JWT, timeout de 15s, upload multipart
  - `services/SyncService.js` — fila offline: processa SQLite ao reconectar, idempotência por `client_uuid`
  - `database/sqlite.js` — banco local SQLite via expo-sqlite: tabelas `fila_sync` e `cache_dados`
  - `context/` — contexto de autenticação global
  - `components/` — componentes reutilizáveis de UI
  - `utils/` — helpers de formatação e validação

### Painel Web (`/web`)
- **Runtime**: React 19 + Vite
- **Público-alvo**: gestores e administrativo
- **Componentes internos**:
  - `App.jsx` — setup de rotas protegidas e contexto de sessão
  - `pages/` — PainelDespacho (calendário drag-and-drop com react-big-calendar), MapaEquipe (react-leaflet), páginas de Clientes, Financeiro, Estoque, Suprimentos, WhatsApp, Configurações
  - `services/api.js` — instância axios com interceptador de 401 (refresh automático) e mutex de sessão
  - `contexts/` — contexto de autenticação global
  - `hooks/` — hooks customizados de dados
  - `routes/` — proteção de rotas por perfil/permissão

### Infraestrutura
- **Deploy**: Render (produção) + Docker + pipeline AWS EC2/ECS
- **CI/CD**: GitHub Actions (`ci.yml`) — instala, testa, audita dependências e compila as três camadas
- **Armazenamento de arquivos**: PostgreSQL BYTEA (fotos e PDFs embutidos no banco, sem S3)
- **Autenticação**: JWT HS256 (access 8h + refresh 30d) com invalidação por `senha_alterada_em`

### Banco de Dados (PostgreSQL)
Mais de 30 tabelas cobrindo:
`empresas`, `usuarios`, `usuario_permissoes`, `clientes`, `aparelhos`, `ordens_servico`, `os_historico`, `os_fotos`, `os_checklist_respostas`, `os_medicoes`, `os_itens`, `os_pausas`, `produtos`, `estoque_movimentos`, `estoque_tecnico`, `estoque_reservas`, `catalogo_servicos`, `orcamentos`, `orcamento_itens`, `pagamentos`, `fornecedores`, `compras`, `compra_itens`, `contratos`, `contrato_aparelhos`, `notificacoes`, `dispositivos_push`, `whatsapp_conversas`, `whatsapp_mensagens`, `checklist_modelos`, `lgpd_auditoria`

---

## 2. Como você sabe que seu "Projeto" possui qualidade?

### Evidências concretas de qualidade identificadas na análise do código:

**Segurança**
- Autenticação JWT com par access + refresh token e invalidação imediata ao trocar senha (campo `senha_alterada_em` comparado ao `iat` do token em toda requisição autenticada)
- Rate limiting no login (10 req/15min) e refresh (30 req/15min)
- Validação de magic bytes em uploads — impede MIME spoofing mesmo que o cliente declare um `Content-Type` falso
- CORS com lista de origens explícita; Helmet com CSP configurada
- Multi-tenancy rigoroso: `empresa_id` extraído do JWT (nunca do corpo da requisição) e aplicado em 100% das queries, com teste automatizado cobrindo esse cenário
- Senhas com bcrypt custo 12; campos sensíveis mascarados automaticamente no logger (senha, token, CPF, telefone, email)
- LGPD implementada: endpoints de exportação (`GET /conta/dados`) e anonimização (`DELETE /conta/dados`) com auditoria imutável em `lgpd_auditoria`

**Confiabilidade**
- Operações críticas (criar OS, baixar estoque, finalizar OS) dentro de transações atômicas com ROLLBACK automático em caso de erro
- Lock pessimista (`FOR UPDATE OF p`) na baixa de estoque, prevenindo condição de corrida entre técnicos simultâneos
- Verificação de conflito de agenda usando `tstzrange` do PostgreSQL
- Geração de PDF e envio WhatsApp fora da transação principal — falha nessas etapas não reverte a finalização da OS
- Idempotência na sincronização offline: `client_uuid` impede duplicatas no servidor; índice único `(tipo, client_uuid)` impede duplicatas no SQLite local
- Estratégia de retry no SyncService: erros 4xx marcam falha e continuam a fila; erros 5xx ou de rede interrompem o loop (não martela o servidor)

**Testabilidade**
- Arquivo `test/api.test.js` com 28 testes usando o test runner nativo do Node.js
- Testes cobrem: health check, autenticação, RBAC, isolamento de tenant, validações Zod, conflito de agenda, baixa de estoque, WhatsApp (bot + normalização de número), PDF em memória, custo médio em recebimento de compra
- App factory pattern (`createApp()`) permite instanciar a API em porta aleatória nos testes sem conflito
- Banco mockado por monkey-patching cirúrgico de `db.query`/`db.transaction` em cada teste
- CI/CD roda testes, build e auditoria de dependências automaticamente a cada push/PR na branch `master`

**Manutenibilidade**
- Responsabilidades claramente separadas: controllers finos, model com queries, services para integrações externas
- Logger estruturado em JSON com `request_id` rastreável em toda a cadeia de chamadas
- Documentação técnica completa em `docs/` (8 arquivos) cobrindo visão geral, banco, API, fluxo de OS, mobile, web, integrações e melhorias futuras
- Patches de banco incrementais e versionados em `src/database/patches/`
- Soft delete em todas as entidades (dados nunca removidos fisicamente)

---

## 3. Quais possíveis bugs?

Os bugs foram classificados por severidade após análise do código-fonte.

### 🔴 Crítico

**Bug 1 — Erro global handler pode vazar stack trace em produção**
- **Arquivo**: `src/app.js`, handler de erro (última linha do `createApp`)
- **Descrição**: O handler global retorna `error.message` diretamente para qualquer erro sem `error.status`. Se um erro interno não tratado chegar aqui sem `status`, a mensagem bruta do sistema é exposta ao cliente.
- **Trecho problemático**: `res.status(error.status || 400).json({ erro: error.message || 'Erro interno do servidor.' })` — usa `400` como fallback em vez de `500`, podendo mascarar erros 5xx como 4xx.

**Bug 2 — Sem limite de tentativas na fila de sincronização offline**
- **Arquivo**: `mobile/src/services/SyncService.js`
- **Descrição**: O campo `tentativas` é incrementado via `registrarFalha()` mas nunca verificado antes de tentar enviar. Um item com erro permanente (ex.: OS deletada no servidor, retornando 4xx) é marcado com erro mas ficará na fila para sempre — sem limite de tentativas (`MAX_RETRIES`) e sem feedback ao usuário de que aquela ação falhou definitivamente.

**Bug 3 — `criarRetorno` não valida conflito de agenda**
- **Arquivo**: `src/controllers/os/OsEventoController.js`, método `criarRetorno`
- **Descrição**: Ao criar uma OS de retorno, o sistema insere diretamente sem chamar `validarConflito()`. O técnico pode receber dois agendamentos sobrepostos se o retorno for para um horário já ocupado.

### 🟠 Alto

**Bug 4 — Sem validação de ID de OS no `criarRetorno`**
- **Arquivo**: `src/controllers/os/OsEventoController.js`, método `criarRetorno`, linha inicial
- **Descrição**: `const id = Number(req.params.id)` é usado sem verificar se é inteiro positivo (`Number.isInteger(id) && id > 0`), ao contrário dos outros métodos do mesmo controller que fazem essa checagem. Um `id` inválido (NaN) chegaria até a query SQL.

**Bug 5 — `UPDATE ordens_servico` em `criarRetorno` sem filtro de `empresa_id`**
- **Arquivo**: `src/controllers/os/OsEventoController.js`, método `criarRetorno`
- **Descrição**: O UPDATE que marca `retorno_necessario=TRUE` na OS pai usa apenas `WHERE id=$2`, sem `AND empresa_id=...`. O `empresa_id` é verificado na busca inicial com `buscarPorId`, mas o UPDATE subsequente não repete o filtro, deixando uma janela de segurança desnecessária.

**Bug 6 — Web armazena tokens JWT no `localStorage`**
- **Arquivo**: `web/src/services/api.js`
- **Descrição**: `localStorage.setItem('climasaas_token', ...)` e `localStorage.setItem('climasaas_refresh_token', ...)`. O `localStorage` é acessível por qualquer script JavaScript da página. Um ataque XSS bem-sucedido pode exfiltrar ambos os tokens. O mobile usa `expo-secure-store` (correto); o web deveria usar cookies `HttpOnly; Secure; SameSite=Strict`.

**Bug 7 — Sem validação de tamanho mínimo do `client_uuid` no banco SQLite mobile**
- **Arquivo**: `mobile/src/database/sqlite.js`
- **Descrição**: O índice único `ux_fila_tipo_uuid` tem cláusula `WHERE client_uuid != ''`, mas a migração que adiciona `client_uuid` usa `DEFAULT ''`. Se `enfileirar()` for chamado antes de `Crypto.randomUUID()` resolver (ou em caso de erro silencioso no crypto), o item entra com `client_uuid = ''` e não é protegido pelo índice, podendo gerar duplicatas na fila.

**Bug 8 — PdfService não tem timeout; geração lenta bloqueia a resposta**
- **Arquivo**: `src/controllers/OsController.js`, função `_gerarEPersistirPdf`
- **Descrição**: A geração de PDF é chamada com `await` antes do `res.json(...)` (linha `pdfUrl = await _gerarEPersistirPdf(...)`). Se a geração de um PDF com muitas fotos demorar vários segundos, a resposta HTTP da finalização da OS fica pendente todo esse tempo. O cliente mobile pode interpretar como timeout e tentar finalizar novamente.

**Bug 9 — Sem proteção contra múltiplas finalizações simultâneas da mesma OS**
- **Arquivo**: `src/controllers/OsController.js`, método `atualizarStatus`
- **Descrição**: Duas requisições `PATCH /os/:id/status { novo_status: "FINALIZADA" }` simultâneas (ex.: usuário duplo clique ou retry do SyncService) podem ambas passar pela checagem `transicoes[os.status].includes(novoStatus)` e executar o bloco de baixa de estoque duas vezes antes que a primeira transação finalize. O lock na baixa de estoque (`FOR UPDATE OF p`) protege o estoque, mas o `os_historico` pode receber dois registros de `EM_ANDAMENTO → FINALIZADA` e o PDF pode ser gerado duas vezes.

### 🟡 Médio

**Bug 10 — Evento `PAUSAR` não valida se já há pausa aberta de forma atômica**
- **Arquivo**: `src/controllers/os/OsEventoController.js`, método `registrarEvento`
- **Descrição**: A checagem `os.pausado_em` é feita sobre os dados buscados no início da transação (`buscarPorId`). Se dois eventos `PAUSAR` chegarem simultaneamente, ambos podem passar pela verificação antes que o banco seja atualizado, inserindo duas entradas em `os_pausas` sem a segunda ter `retomado_em`.

**Bug 11 — Sem validação de coordenadas GPS no `CHECKOUT`**
- **Arquivo**: `src/validators/osValidator.js` e `src/controllers/os/OsEventoController.js`
- **Descrição**: O validator Zod exige `latitude` e `longitude` obrigatórios para `CHECKIN`, mas não para `CHECKOUT`. O evento `CHECKOUT` também consome `latitude` e `longitude` no UPDATE do banco, mas se chegarem `null` o banco aceita e o GPS do checkout fica nulo, comprometendo a rastreabilidade do técnico.

**Bug 12 — Ausência de indicador de loading nas telas da agenda mobile**
- **Arquivo**: `mobile/src/screens/Agenda/AgendaMapa.js`
- **Descrição**: A tela de mapa exibe marcadores de técnicos sem feedback visual de carregamento ou estado de erro tratado. Se a requisição falhar (rede instável em campo), a tela fica em branco sem mensagem ao usuário.

**Bug 13 — `capturada_em` aceita qualquer string no upload de foto**
- **Arquivo**: `src/controllers/FotoController.js`
- **Descrição**: `req.body.capturada_em` é passado diretamente para `COALESCE($7::timestamptz, NOW())`. Uma string inválida causa erro 500 com mensagem genérica em vez de 400 com mensagem amigável.

**Bug 14 — Sem migração automática de schema no mobile (versão de banco)**
- **Arquivo**: `mobile/src/database/sqlite.js`
- **Descrição**: A migração do campo `client_uuid` usa `ALTER TABLE ... ADD COLUMN` dentro de um `catch(() => {})`. Se futuras colunas forem adicionadas da mesma forma, não há número de versão de schema para controlar o que foi ou não aplicado. Em banco corrompido ou reinstalação parcial, o estado do schema fica indefinido.

### 🟢 Baixo

**Bug 15 — Logger do `removerFila` de foto não loga erro se `deleteAsync` falhar**
- **Arquivo**: `mobile/src/services/SyncService.js`, case `FOTO_OS`
- **Descrição**: `FileSystem.deleteAsync(dados.uri, { idempotent: true }).catch(() => {})` silencia erros de limpeza de arquivo local. Arquivos temporários de fotos podem se acumular no armazenamento do dispositivo sem que o usuário ou o sistema saiba.

**Bug 16 — `moment` com locale pt-br pode gerar labels erradas em react-big-calendar**
- **Arquivo**: `web/src/pages/PainelDespacho/index.jsx`
- **Descrição**: `moment.locale('pt-br')` é chamado uma vez globalmente. Se outro componente na aplicação alterar o locale do `moment` (biblioteca global/mutável), o calendário pode exibir nomes de dias/meses no idioma errado sem lançar erro.

**Bug 17 — Fotos são servidas sem autenticação**
- **Arquivo**: `src/app.js`, rota `GET /arquivos/fotos/:chave`
- **Descrição**: A rota de fotos e PDFs é pública (sem `authMiddleware`). Qualquer pessoa que obtenha o `storage_key` (UUID v4) pode acessar evidências e assinaturas de clientes. Embora o UUID seja difícil de adivinhar, a URL completa pode vazar em logs, histórico de browser ou mensagens de WhatsApp.

**Bug 18 — Ausência de testes no mobile e no web**
- **Arquivo**: `mobile/`, `web/`
- **Descrição**: O CI/CD executa `npm run check` no mobile (apenas verificação de sintaxe Expo) e `npm run build` no web (apenas compilação). Não há nenhum teste automatizado de componente, integração ou E2E para as camadas mobile e web.

---

## 4. Qual é o impacto dos bugs em seu "Projeto"?

| Bug | Impacto Funcional | Impacto no Negócio | Severidade |
|---|---|---|---|
| 1 — Stack trace em produção | Vazamento de informações internas do servidor | Risco de segurança; facilita ataques direcionados | 🔴 Crítico |
| 2 — Sem limite de tentativas na fila offline | Operações do técnico ficam presas indefinidamente | Técnico não sabe que a OS não foi salva; retrabalho e perda de dados | 🔴 Crítico |
| 3 — Retorno sem validação de conflito | Dois atendimentos no mesmo horário para o mesmo técnico | Falha operacional; técnico recebe OS sobrepostas | 🔴 Crítico |
| 4 — ID sem validação em `criarRetorno` | Erro 500 desnecessário | Má experiência do usuário; possível rastreamento de IDs internos | 🟠 Alto |
| 5 — UPDATE de OS pai sem `empresa_id` | Risco teórico de atualizar OS de outra empresa | Violação de isolamento multi-tenant | 🟠 Alto |
| 6 — Tokens no `localStorage` | Tokens roubáveis por XSS | Comprometimento total da sessão de gestor | 🟠 Alto |
| 7 — `client_uuid` vazio no SQLite | Duplicatas de operação na fila | OS ou foto enviada duas vezes ao servidor | 🟠 Alto |
| 8 — PDF sem timeout | Resposta da finalização travada por segundos | Técnico crê que a OS não finalizou; double-click; retry manual | 🟠 Alto |
| 9 — Finalização simultânea | Duplo registro de histórico; PDF duplicado | Inconsistência de dados; custo de armazenamento | 🟠 Alto |
| 10 — Dupla pausa simultânea | Pausa órfã em `os_pausas` sem `retomado_em` | Tempo de pausa calculado incorretamente | 🟡 Médio |
| 11 — GPS ausente no CHECKOUT | Rastreabilidade incompleta | Relatório sem localização de saída; auditoria prejudicada | 🟡 Médio |
| 12 — Sem loading no mapa mobile | Tela em branco em campo | Técnico não sabe o status da equipe; operação prejudicada | 🟡 Médio |
| 13 — `capturada_em` sem validação | Erro 500 em vez de 400 | Experiência ruim; dificuldade de diagnóstico | 🟡 Médio |
| 14 — Sem versionamento de schema SQLite | Estado do banco mobile indefinido após atualização | Perda de dados offline em cenários de upgrade | 🟡 Médio |
| 15 — Arquivo temporário não limpo | Acúmulo de fotos no dispositivo | Esgotamento de armazenamento do celular do técnico | 🟢 Baixo |
| 16 — Locale `moment` mutável | Labels erradas no calendário | Desorientação visual do gestor; data interpretada errada | 🟢 Baixo |
| 17 — Fotos sem autenticação | Acesso a evidências sem login | Violação de privacidade de clientes (LGPD) | 🟢 Baixo |
| 18 — Sem testes mobile/web | Regressões não detectadas no CI | Bugs chegam a produção sem barreira de qualidade | 🟢 Baixo |

---

## 5. (Perspectiva QA) Como evitar esse tipo de problema no futuro?

### Processo de Desenvolvimento

**Revisão de código obrigatória (Code Review)**
- Toda PR deve ser revisada por ao menos um outro desenvolvedor antes do merge
- Checklist de revisão incluindo: validação de entrada, filtro de `empresa_id`, tratamento de erro, cobertura de teste
- Uso de pull request templates no GitHub com perguntas-guia de segurança e testes

**Definição de Pronto (Definition of Done)**
- Toda feature nova deve ter pelo menos um teste automatizado cobrindo o caminho feliz e um caminho de erro
- Bugs corrigidos devem ter um teste de regressão que falharia antes da correção
- Nenhum merge permitido se o CI falhar

**Práticas de Codificação Segura**
- Criar um guia interno de padrões: toda rota autenticada usa `empresa_id` do token; todo `req.params.id` é validado com `Number.isInteger(id) && id > 0`; toda data de entrada passa por validação Zod antes de ir ao banco
- Padronizar o padrão `throw Object.assign(new Error(...), { status: XXX })` e validar no handler global que `error.status >= 500` usa mensagem genérica ao cliente
- Criar um helper centralizado `validarIdParam(id)` para evitar a inconsistência encontrada no Bug 4

**Revisão de Segurança Periódica**
- Executar `npm audit` localmente antes de todo PR (já no CI, mas antecipar a descoberta)
- Revisão semestral de dependências desatualizadas com `npm outdated`
- Revisar permissões CORS e lista de origens ao adicionar novos domínios

**Documentação de Decisões de Arquitetura (ADR)**
- Registrar decisões como "tokens no localStorage vs cookie HttpOnly" em arquivos ADR em `docs/adr/`
- Facilita que novos membros entendam o contexto e não introduzam alternativas sem discussão

**Monitoramento em Produção**
- Configurar alertas para taxas de erro 5xx acima de threshold definido
- Monitorar tamanho da tabela `os_fotos` (BYTEA) e `ordens_servico.pdf_conteudo` (BYTEA) — a decisão de armazenar binários no PostgreSQL requer monitoramento ativo de crescimento de banco
- Logs estruturados (já implementados) devem ser enviados a uma ferramenta de observabilidade (ex.: Datadog, Loki, CloudWatch) com dashboards para os campos `nivel: 'erro'`

### Automação

**Ampliar cobertura de testes**
- Backend: aumentar de 28 para ~60 testes cobrindo os controllers ainda sem cobertura (`FinanceiroController`, `SuprimentosController`, `GestaoController`, `CadastroController`)
- Mobile: adicionar testes de componente com `@testing-library/react-native` para as telas críticas (LoginScreen, CameraOS, SyncService)
- Web: adicionar testes de componente com `@testing-library/react` e testes E2E com Playwright para os fluxos de criação de OS e reagendamento no PainelDespacho
- Configurar relatório de cobertura de código (Istanbul/`--experimental-test-coverage`) e definir meta mínima de 70% nas funções de negócio

**Static Analysis**
- Adicionar ESLint com regras de segurança (`eslint-plugin-security`) ao pipeline CI para as três camadas
- Considerar TypeScript gradual no backend para eliminar erros de tipo em tempo de compilação

---

## 6. (Perspectiva QC) Como você sabe se o seu "Projeto" apresenta problemas?

### Sinais que indicam problema em tempo real

**Monitoramento de erros (o que observar no dashboard)**
- Taxa de respostas `5xx` acima de 0,5% das requisições nas últimas 1h → indica erro interno não tratado
- Respostas com `nivel: 'erro'` no log estruturado → filtrar por `rota` para identificar o endpoint afetado
- Tempo médio de resposta do `POST /os` e `PATCH /os/:id/status` acima de 3s → pode indicar lentidão na geração de PDF ou query sem índice
- Aumento no pool de conexões PostgreSQL próximo do limite de 10 → indica queries lentas ou conexões não liberadas
- Crescimento anormal da tabela `os_fotos` (BYTEA) → pode impactar performance de toda a API

**Indicadores de negócio que revelam problemas**
- OS ficam presas em status `EM_ANDAMENTO` sem evolução há mais de 24h → pode indicar bug no SyncService ou técnico sem internet
- Itens em `fila_sync` com `tentativas > 3` sem sucesso → indica problema de integração entre mobile e API
- `os_historico` com dois registros `EM_ANDAMENTO → FINALIZADA` para a mesma OS → indica bug de finalização dupla (Bug 9)
- `os_pausas` com `retomado_em IS NULL` em OS já finalizadas → indica bug de pausa órfã (Bug 10)
- Notificações push com alto índice de falha → indica tokens expirados em `dispositivos_push`

**Feedback dos usuários**
- Técnico relata que foto "não subiu" após reconexão → investigar `fila_sync.ultimo_erro`
- Gestor relata que OS aparece duplicada no calendário → investigar `client_uuid` e idempotência
- Cliente relata que não recebeu PDF pelo WhatsApp → verificar log com `nivel: 'aviso'` e tag `os.pdf.falha`

**Validações de integridade no banco**
Consultas SQL que, se retornarem resultados, indicam inconsistência de dados:

```sql
-- OS finalizadas sem assinatura
SELECT id FROM ordens_servico os
WHERE status = 'FINALIZADA'
  AND NOT EXISTS (SELECT 1 FROM os_fotos f WHERE f.os_id = os.id AND f.tipo = 'ASSINATURA');

-- OS finalizadas sem PDF gerado
SELECT id FROM ordens_servico
WHERE status = 'FINALIZADA' AND pdf_conteudo IS NULL;

-- Pausas abertas em OS já finalizadas
SELECT os_id FROM os_pausas
WHERE retomado_em IS NULL
  AND os_id IN (SELECT id FROM ordens_servico WHERE status IN ('FINALIZADA','CANCELADA'));

-- Estoque negativo
SELECT id, nome, estoque FROM produtos WHERE estoque < 0;
```

---

## 7. Quais testes você faria no seu "Projeto"? Justifique

### 7.1 Testes de Unidade

**Por quê**: verificam funções isoladas sem dependência de banco ou rede. Rápidos de executar, fáceis de manter, encontram regressões imediatamente.

| O que testar | Justificativa |
|---|---|
| `validarMagicBytes(buffer, mimetype)` em `upload.js` | Segurança crítica: garantir que JPG forjado como PNG é rejeitado e vice-versa |
| `WhatsAppService._formatarNumero()` | Já coberto; ampliar para DDDs de 2 dígitos, números com +55, sem DDI |
| `WhatsAppBotService.decidir()` para todas as etapas | Lógica de estado do bot — cada transição deve ser coberta |
| `PdfService.gerarOsPdf()` e `gerarOrcamentoPdf()` | Verificar que o buffer retornado começa com `%PDF` e tem tamanho razoável |
| Funções de validação Zod em `osValidator.js` e `cadastroValidator.js` | Garantir que campos obrigatórios, enums e formatos são rejeitados corretamente |
| Cálculo de `total_pausa_segundos` em `OsEventoController` | Lógica temporal — testar com pausas de duração zero ou negativa |

### 7.2 Testes de Integração (API)

**Por quê**: verificam que controller + model + middlewares funcionam juntos corretamente, incluindo validação de entrada, autenticação, autorização e respostas HTTP. São a camada mais eficaz de testes para uma API REST.

| Cenário | Justificativa |
|---|---|
| `POST /login` com senha correta → retorna access + refresh token | Fluxo de entrada no sistema; se quebrar, ninguém acessa nada |
| `POST /login` com senha errada → 401 | Barreira de segurança básica |
| `POST /auth/refresh` com token válido → novo par de tokens | Sessão longa; técnico não precisa fazer login todo dia |
| `POST /auth/refresh` com token emitido antes de `senha_alterada_em` → 401 | Garante invalidação de sessão após troca de senha |
| `GET /os/agenda` sem token → 401 | Proteção de rotas |
| `GET /os/agenda` com permissão revogada → 403 | RBAC granular funcionando |
| `POST /os` com `empresa_id` no body → 400 (tenant injection bloqueado) | Isolamento multi-tenant — bug de segurança se falhar |
| `POST /os` com `agendado_para` sobreposto → 409 | Conflito de agenda |
| `POST /os/:id/eventos CHECKIN` sem GPS → 400 | Validação de entrada obrigatória |
| `POST /os/:id/eventos CHECKOUT` sem GPS → deve exigir GPS (atualmente não exige — Bug 11) | Regressão do bug corrigido |
| `PATCH /os/:id/status FINALIZADA` sem assinatura → 422 | Pré-requisito de finalização |
| `PATCH /os/:id/status FINALIZADA` com estoque insuficiente → 422 | Integridade de estoque |
| `POST /os/fotos` com arquivo não-imagem → 400 | Magic bytes validation |
| `POST /os/fotos` com `client_uuid` duplicado → 200 (idempotente) | Comportamento esperado no retry offline |
| `POST /os/:id/retorno` com horário sobreposto → 409 (Bug 3 a corrigir) | Regressão do bug corrigido |
| `POST /os/:id/retorno` sem `empresa_id` no UPDATE (Bug 5) → verificar que OS de empresa diferente não é alterada | Segurança multi-tenant |
| `DELETE /clientes/:id` com perfil sem permissão → 403 | RBAC |
| `POST /compras/:id/receber` → estoque atualizado com custo médio correto | Regra de negócio financeira crítica |
| `POST /estoque/reservas` acima do saldo → 422 | Controle de estoque |

### 7.3 Testes de Sincronização Offline (Mobile)

**Por quê**: o SyncService é a funcionalidade mais complexa e crítica do app — técnicos trabalham em locais sem sinal, e qualquer bug aqui resulta em perda de dados de atendimento.

| Cenário | Justificativa |
|---|---|
| Enfileirar a mesma operação duas vezes com mesmo `client_uuid` → apenas 1 item na fila | Índice único no SQLite |
| Enfileirar sem internet → item gravado; ao conectar → item enviado e removido | Fluxo principal offline |
| Servidor retorna 4xx → item marcado com erro, próximo item continua | Erro permanente não trava a fila inteira |
| Servidor retorna 5xx → loop interrompido | Não martela o servidor degradado |
| Upload de foto com arquivo deletado antes do sync → deve tratar graciosamente | Arquivo pode ser removido pelo SO por falta de espaço |
| `tentativas > MAX_RETRIES` → item removido da fila com log de erro (Bug 2 a corrigir) | Regressão do bug corrigido |
| Token expirado durante sync → refresh automático e retry | Sessão longa em campo |

### 7.4 Testes de Interface (Web — E2E com Playwright)

**Por quê**: fluxos de UI complexos como drag-and-drop no calendário, reagendamento e formulários multi-etapa não podem ser cobertos apenas por testes de API. Playwright simula o comportamento real do navegador.

| Cenário | Justificativa |
|---|---|
| Login com credenciais inválidas → mensagem de erro visível | Experiência básica do gestor |
| Login com credenciais válidas → redireciona para PainelDespacho | Fluxo de entrada |
| Sessão expirada → redireciona para login sem tela em branco | Tratamento do evento `climasaas:session-expired` |
| Criar OS pelo painel → OS aparece no calendário | Fluxo principal do gestor |
| Drag-and-drop de OS no calendário → reagendamento confirmado via API | Funcionalidade central do PainelDespacho |
| Mapa da equipe exibe marcadores dos técnicos | Funcionalidade de monitoramento em campo |
| Responsividade em tela 1280×720 e 1920×1080 | Gestores usam monitores variados |
| Navegação por teclado nos formulários principais | Acessibilidade básica (WCAG 2.1 AA) |

### 7.5 Testes de Performance

**Por quê**: o sistema armazena fotos e PDFs como BYTEA no PostgreSQL — uma decisão de design que escala mal. É necessário medir o impacto antes que se torne um problema de produção.

| Cenário | Justificativa |
|---|---|
| `GET /arquivos/fotos/:chave` com 100 requisições simultâneas | BYTEA no banco: medir tempo de leitura vs alternativa com cache |
| `PATCH /os/:id/status FINALIZADA` com OS contendo 10 fotos | PDF com muitas imagens pode exceder timeout do cliente (Bug 8) |
| Sincronização de fila com 50 itens acumulados | Técnico sem sinal por horas — verificar tempo de sync ao reconectar |
| `GET /os/todas` com 10.000 OS no banco | Pagination e índices — verificar se `idx_os_empresa` é usado corretamente |

### 7.6 Testes de Segurança

**Por quê**: o sistema lida com dados pessoais de clientes (LGPD), evidências fotográficas, contratos e informações financeiras. Falhas de segurança têm impacto direto no negócio e em conformidade legal.

| Cenário | Justificativa |
|---|---|
| Técnico da empresa A tenta acessar OS da empresa B → 403/404 | Isolamento multi-tenant (multi-tenancy bypass) |
| Enviar arquivo `.php` com `Content-Type: image/jpeg` → 400 | Magic bytes validation |
| Token de usuário desativado → 401 em toda requisição subsequente | Invalidação de sessão |
| 11 tentativas de login em 15 min → 429 | Rate limiting funcional |
| Injeção de SQL via `busca` na agenda → não deve afetar o banco | Parâmetros bindados — confirmar via teste |
| Acessar `GET /arquivos/fotos/:chave` sem autenticação → verificar se requer proteção | Bug 17 — confirmar escopo da exposição |
| `DELETE /conta/dados` → dados anonimizados e `lgpd_auditoria` registrado | Conformidade LGPD |
