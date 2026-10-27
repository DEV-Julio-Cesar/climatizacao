# 05 — Aplicativo Mobile

**Tecnologia:** React Native + Expo SDK 57  
**Plataforma alvo:** Android (APK/AAB via EAS). iOS possível mas não configurado.  
**Público:** Técnicos de campo e gestores usando celular.

---

## Estrutura de Navegação

```
App.js
 ├── LoginScreen (sem autenticação)
 └── Stack Navigator (autenticado)
       ├── Inicio (Bottom Tab Navigator)
       │     ├── AgendaTab ──── AgendaMapa
       │     ├── ClientesTab ── Clientes   (permissão: CLIENTES_VISUALIZAR)
       │     ├── GestaoTab ─── Gestao     (permissão: GESTAO_VISUALIZAR)
       │     └── PerfilTab ─── PerfilScreen
       │
       ├── NovaOS          ← Checklist (formulário de criação)
       ├── DetalhesOS
       ├── MapaAtendimento
       ├── MapaRota
       ├── Sincronizacao
       ├── CameraOS
       ├── ExecucaoOS
       ├── AssinaturaOS
       ├── Finalizadas
       ├── Clientes
       ├── ClienteForm
       ├── EquipamentoForm
       ├── EquipamentoDetalhe
       ├── LeitorQR
       ├── Gestao
       ├── Catalogo
       ├── Orcamentos
       ├── OrcamentoForm
       ├── OrcamentoDetalhe
       ├── Recebimentos
       ├── Contratos
       ├── Relatorios
       ├── Notificacoes
       ├── AgendaEquipe
       └── Tecnicos
```

**Total de telas:** 30+

---

## Telas por Módulo

### Autenticação

#### `LoginScreen`
- Formulário email + senha
- Botão de mostrar/esconder senha
- Tratamento de erros diferenciado por código HTTP:
  - 401/400 → "E-mail ou senha incorretos"
  - 429 → "Muitas tentativas"
  - 0 (rede) → "Sem conexão"
  - 5xx → "Erro no servidor"
- Salva `token` e `refresh_token` no `SecureStore`
- Registra token push ao logar

---

### Aba — Agenda

#### `AgendaMapa`
Tela principal do técnico. Lista ordens do dia.

- Filtros: **Hoje / Atrasadas / Próximas / Todas**
- Busca por texto (nome do cliente, ID, endereço)
- Cada card exibe: tipo de serviço, cliente, endereço, horário, status (badge colorido)
- FAB `+` para criar nova OS
- Sincroniza offline ao ganhar foco (`useFocusEffect`)
- Cache local SQLite para funcionar sem internet
- Indicador de itens pendentes na fila offline

#### `MapaRota`
- Exibe todas as OS do dia em um mapa (react-native-maps)
- Marcadores numerados por horário
- Popup com informações da OS
- Rota otimizada no mapa

#### `MapaAtendimento`
- Mapa focado no endereço de um atendimento específico
- Geocodificação via `expo-location.geocodeAsync` se não houver lat/lon
- Botões "Navegar" (abre Google Maps / Apple Maps via deep link) e "A caminho" (registra evento)

---

### Aba — Ordem de Serviço

#### `Checklist` (formulário de criação de OS)
> O nome do arquivo é `Checklist.js` mas é o formulário de **criação de nova OS**.

- Seleção de **cliente** (busca na lista local)
- Seleção de **equipamento** do cliente (filtrada)
- Seleção de **tipo de serviço** (5 tipos)
- Campo de **descrição do problema**
- Data/hora de agendamento (opcional)
- Suporte a criação offline (enfileira `CRIAR_OS`)

#### `DetalhesOS`
Tela central durante o atendimento.

- **Cabeçalho**: tipo, status badge, cliente, endereço
- **Ações do cliente**: Ligar (tel:), WhatsApp (wa.me), Mapa
- **Equipamento**: marca, modelo, capacidade, tipo de gás, histórico de OS anteriores
- **Timeline de andamento**: A_CAMINHO, CHECK-IN, CHECK-OUT com horários e GPS
- **Galeria de fotos** (miniaturas clicáveis)
- **Controle de pausa**: pausar/retomar com motivo
- **Botão de ação dinâmico** (muda conforme estado):
  - OS aberta → "Iniciar atendimento" (check-in)
  - < 2 fotos → "Registrar fotos"
  - ≥ 2 fotos → "Relatório técnico"
  - Relatório salvo → "Assinatura"

#### `CameraOS`
- Câmera via `expo-camera`
- Seleção de tipo da foto (ANTES / DEPOIS / EVIDENCIA)
- Captura GPS com `expo-location` antes do clique
- Resize para 1200px + compressão (expo-image-manipulator)
- Upload imediato se online
- Cache offline: copia para `FileSystem.documentDirectory`, enfileira `FOTO_OS`
- Comentário opcional por foto

#### `ExecucaoOS`
Formulário de relatório técnico em 5 seções:

1. **Diagnóstico e solução** — campos de texto livre (mín. 5 chars)
2. **Checklist** — itens do modelo configurado para o tipo de serviço; suporta observações para itens não-conformes; medições com validação de faixa
3. **Medições técnicas** — temperatura retorno/insuflamento, tensão, corrente, pressão baixa/alta, umidade, superaquecimento, subresfriamento, tipo de gás
4. **Peças e serviços** — seleção do catálogo com preço preenchido automaticamente; opção de item manual
5. **Garantia e retorno** — dias de garantia, checkbox "necessita retorno" com agendamento

- Salvo offline como `EXECUCAO_OS`

#### `AssinaturaOS`
- Canvas de assinatura (`react-native-signature-canvas`)
- Botões Limpar / Confirmar
- Ao confirmar:
  1. Converte assinatura para PNG
  2. Upload como foto tipo `ASSINATURA`
  3. Registra CHECKOUT com GPS
  4. Finaliza OS (`STATUS_OS → FINALIZADA`)
- Toda a sequência enfileirada offline se sem internet

#### `Finalizadas`
- Lista OS finalizadas da empresa (não apenas do técnico logado)
- Busca por texto
- Exibe valor total, técnico, cliente, data de finalização
- Link para PDF quando disponível

---

### Aba — Clientes

#### `Clientes`
- Lista todos os clientes da empresa
- Busca por nome/CPF/endereço
- Cada item mostra quantos aparelhos tem
- FAB para novo cliente

#### `ClienteForm`
- Criação e edição de cliente
- Busca de CEP com preenchimento automático de endereço (ViaCEP)
- Campo de quantidade de aparelhos (cria N aparelhos em branco)
- Suporte a coordenadas GPS manuais

#### `EquipamentoDetalhe`
- Ficha completa do aparelho: marca, modelo, BTUs, série, patrimônio, tipo de gás, ambiente
- Histórico de OS finalizadas naquele aparelho
- Datas: instalação, garantia, próxima manutenção
- QR Code com deep link `climasaas://equipamento/:public_id`
- Botão para criar OS rápida para o aparelho

#### `EquipamentoForm`
- Criação e edição de equipamento
- Todos os campos técnicos
- Seleção de cliente pai

#### `LeitorQR`
- Câmera para ler QR Code
- Abre `EquipamentoDetalhe` ao reconhecer um `public_id` válido

---

### Aba — Gestão

> Visível apenas para usuários com permissão `GESTAO_VISUALIZAR`.

#### `Gestao`
Hub de gestão. Exibe KPIs do mês:
- Total de OS, finalizadas, em andamento, atrasadas
- Faturado e recebido
- Tempo médio de atendimento
- Links para todos os sub-módulos

#### `Catalogo`
- Lista produtos e serviços ativos
- Filtro por tipo (peça/serviço) e busca
- Criar item de catálogo
- Entrada rápida de estoque via modal

#### `Orcamentos`
- Lista orçamentos com status (badge colorido)
- Filtro por status
- Acesso ao detalhe para aprovar/recusar/converter

#### `OrcamentoForm`
- Criar orçamento com cliente, aparelho, itens do catálogo
- Cálculo automático de subtotal, desconto e total
- Salvar como rascunho ou enviar diretamente

#### `OrcamentoDetalhe`
- Detalhe do orçamento com itens
- Mudar status (Aprovar / Recusar / Expirar)
- Converter em OS com um toque
- Enviar por WhatsApp
- Baixar/visualizar PDF

#### `Recebimentos`
- Lista OS finalizadas com saldo pendente
- Registrar pagamento com forma (PIX, dinheiro, etc.) e valor
- Exibe total pago e saldo restante

#### `Contratos`
- Lista contratos preventivos ativos
- Destaca contratos com visita vencida ou próxima
- Gerar visita preventiva (cria OS de manutenção)

#### `Relatorios`
Dashboard gerencial dos últimos 90 dias:
- OS totais, finalizadas, taxa de 1ª resolução
- Faturado, recebido, ticket médio
- Receita recorrente de contratos
- Top 5 serviços por demanda
- Produtividade por técnico (OS, tempo médio, faturado)

#### `Notificacoes`
- Lista notificações (contratos vencendo, alertas de estoque)
- Marcar como lida

#### `AgendaEquipe`
- Visão de todos os técnicos e suas OS por data (gestor)
- Navegação por dias

#### `Tecnicos`
- Lista técnicos da empresa com status (ativo/inativo)

---

### Aba — Perfil

#### `PerfilScreen`
- Nome, e-mail, perfil do usuário logado
- Botão Sair (limpa token + refresh_token + usuario do SecureStore)
- Link para Sincronização

#### `Sincronizacao`
- Mostra quantidade de itens pendentes na fila offline
- Lista detalhada de cada item (tipo, tentativas, último erro)
- Botão "Sincronizar agora"
- Botão "Limpar fila" (descarta tudo)

---

## Offline e Sincronização

### Banco local (SQLite)

Tabelas em `climasaas_offline.db`:

| Tabela | Uso |
|---|---|
| `fila_sync` | Operações pendentes com `client_uuid`, `tentativas`, `ultimo_erro` |
| `cache_dados` | Cache de dados da API (agenda, detalhes, catálogo) |

### Fluxo de sincronização

1. App detecta conexão restaurada (`expo-network`)
2. `tentarSincronizarOffline()` processa fila em ordem FIFO
3. Cada item é processado individualmente
4. Idempotência via `client_uuid`: servidor devolve 200 se já processado
5. Erro 4xx → marca e continua; Erro 5xx/rede → para o loop

---

## Serviços

### `api.js`
- `chamadaAutenticada()`: Bearer token + renovação automática de sessão (1 tentativa com refresh)
- Mutex `_refreshPromise` evita múltiplos refreshes simultâneos
- Timeout de 15s via AbortController
- `uploadFoto()`: usa `expo/fetch` nativo para suporte a `File`
- Erros de rede normalizados para mensagens amigáveis

### `SyncService.js`
- Verifica conectividade antes de tentar
- Processa fila SQLite em FIFO
- 7 tipos de operação suportados
- Idempotência por `client_uuid`

### `notifications.js`
- Solicita permissão de notificação
- Canal Android com vibração
- Registra `ExponentPushToken` na API (`POST /dispositivos/push`)

---

## Melhorias Futuras — Mobile

> Ver também: [08-melhorias-futuras.md](./08-melhorias-futuras.md)

### Alta prioridade

**M1 — Modo escuro**
O app usa apenas tema claro. Implementar `useColorScheme` com paleta alternativa em `src/styles/theme.js`. Todas as telas usam as constantes do tema, então a mudança seria centralizada.

**M2 — Tela de detalhes do equipamento no atendimento**
Ao visualizar o equipamento em `DetalhesOS`, exibir o histórico de OS diretamente na tela (hoje requer navegar para `EquipamentoDetalhe`).

**M3 — Notificações locais de agendamento**
Usar `expo-notifications` para disparar lembretes locais (ex.: 30 min antes de cada OS agendada), sem depender de push notification da API.

**M4 — Câmera com modo portrait obrigatório**
Adicionar lock de orientação (`expo-screen-orientation`) durante o uso da câmera para padronizar as fotos de evidência.

**M5 — Pré-visualização de fotos antes do upload**
Na `CameraOS`, permitir revisar a foto antes de confirmar o envio (hoje envia automaticamente após capturar).

**M6 — Assinatura com nome do cliente**
Em `AssinaturaOS`, adicionar campo de nome para exibir junto à assinatura no PDF.

**M7 — Filtro de agenda por tipo de serviço**
Na `AgendaMapa`, adicionar chips de filtro por `tipo_servico` (Limpeza, Instalação etc.) além dos filtros de data.

**M8 — Exportar OS como PDF no mobile**
Na `DetalhesOS`, permitir que o técnico baixe/compartilhe o PDF da OS finalizada usando `expo-sharing`.

### Média prioridade

**M9 — Biometria no login**
Usar `expo-local-authentication` para login com impressão digital ou Face ID após o primeiro login.

**M10 — Widget de agenda (Android)**
Expo não suporta nativamente, mas é possível via módulo nativo. Exibe próxima OS na tela inicial.

**M11 — Scan de código de barras de produtos**
Em `ExecucaoOS`, ao adicionar peças, permitir escanear o código de barras do produto com a câmera.

**M12 — Galeria de fotos com zoom**
Na visualização de fotos em `DetalhesOS`, implementar pinch-to-zoom com `react-native-reanimated`.

**M13 — Checklist de voz**
Usar `expo-speech` para o técnico responder itens do checklist por voz (acessibilidade e praticidade com as mãos sujas).

**M14 — Histórico de OSs pelo mapa**
Tela nova: mapa com todos os locais atendidos pela empresa nos últimos N dias.

### Baixa prioridade / Tech debt

**M15 — Migrar de React Navigation para Expo Router**
Expo Router (file-based routing) é o futuro da navegação no Expo. Reduz boilerplate.

**M16 — Testes automatizados**
Adicionar testes com Jest + React Native Testing Library para os fluxos críticos (login, criação de OS, sincronização offline).

**M17 — Storybook para componentes**
Componentes como `ErrorBoundary`, cards de OS, formulários são candidatos a um catálogo visual.

**M18 — Paginação na lista de clientes**
`Clientes.js` carrega todos os clientes de uma vez. Implementar paginação ou infinite scroll.

**M19 — Deep links configurados**
`climasaas://equipamento/:id` funciona via QR Code, mas o scheme não está declarado no `app.config.js`. Formalizar.

**M20 — Suporte a iOS**
O app é desenvolvido pensando em Android. Adicionar configurações de Info.plist, permissões, ícone e splash para iOS, e testar no Simulator.
