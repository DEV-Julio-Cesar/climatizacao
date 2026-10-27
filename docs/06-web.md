# 06 — Painel Web

**Tecnologia:** React 19 + Vite  
**Build:** `web/dist/` servido pela API Express em `/painel/*`  
**Público:** Gestores e administrativo (desktop/tablet)  
**Autenticação:** Token JWT em `localStorage`  
**Roteamento:** Hash-based (`#dashboard`, `#despacho`, etc.)

---

## Estrutura de Arquivos

```
web/
  src/
    App.jsx             ← raiz: autenticação, menu lateral, lazy loading
    pages/
      Login.jsx
      Dashboard.jsx
      PainelDespacho/
        index.jsx       ← calendário + drag-and-drop
      MapaEquipe.jsx
      Clientes.jsx
      Catalogo.jsx
      Orcamentos.jsx
      Suprimentos.jsx
      Operacao.jsx
      Tecnicos.jsx
      WhatsApp.jsx
      Configuracoes.jsx
      MinhaConta.jsx
    services/
      api.js            ← axios wrapper com baseURL e interceptor de 401
    components/         ← componentes reutilizáveis (modais, badges, etc.)
  vite.config.js        ← base: '/painel/', alias @=src
  index.html
```

---

## Páginas

### Login
- Formulário email + senha
- Armazena `token` e dados do usuário em `localStorage`
- Redireciona para `#dashboard` após login

---

### `#dashboard` — Dashboard Gerencial

KPIs consolidados da empresa (dados dos últimos 30-90 dias):

**Bloco principal:**
- Total de OS (todas, finalizadas, em andamento, atrasadas, pausadas)
- Taxa de 1ª resolução (OS sem retorno / total finalizadas)
- Retornos necessários

**Financeiro:**
- Total faturado (soma de `valor_total` das OS finalizadas)
- Total recebido (soma de `pagamentos.valor`)
- Receita recorrente de contratos ativos
- Ticket médio

**Contratos:**
- Contratos ativos
- Próximas visitas

**Produtividade da equipe:**
- Tabela com OS por técnico, tempo médio, faturado
- Gráfico de demanda por tipo de serviço

---

### `#despacho` — Painel de Despacho

Calendário interativo para gestão da agenda da equipe.

**Funcionalidades:**
- Visualizações: **Dia / Semana / Mês / Lista** (react-big-calendar)
- **Recursos = técnicos** da empresa
- Cada evento = uma OS com badge de status
- **Drag-and-drop** para reagendar OS (chama `PATCH /os/:id/reagendar`)
- **Criar nova OS**: clique em slot vazio abre modal de criação
- **Detalhes de OS**: clique em evento abre modal com dados completos + botão de reagendamento
- Filtro por técnico
- Busca por cliente ou OS#

**Modal de criação:**
- Seleciona cliente, equipamento, tipo de serviço, técnico, data/hora
- Duração prevista (valida conflito de agenda)

**Modal de detalhe/reagendamento:**
- Exibe todos os dados da OS
- Formulário de reagendamento (novo técnico, nova data, nova duração)

---

### `#mapa` — Mapa da Equipe

Mapa OpenStreetMap (react-leaflet) com visão geográfica de todos os atendimentos do dia.

- Um marcador por OS que tem cliente com `latitude`/`longitude`
- Cor do marcador por status (verde = finalizada, laranja = em andamento, azul = aberta)
- Popup com: OS#, cliente, técnico, endereço, horário
- Filtro por data (ver agenda de qualquer dia)
- Zoom automático para abranger todos os marcadores

---

### `#clientes` — Clientes e Equipamentos

- Lista paginada de clientes com busca por nome, CPF/CNPJ ou cidade
- Card do cliente com lista de aparelhos e botões de ação
- **Detalhe**: dados completos, aparelhos com QR Code, histórico de OS
- **Criar/Editar**: formulário completo com busca de CEP
- **QR Code**: gera e exibe PNG do QR Code do aparelho; botão de download

---

### `#catalogo` — Catálogo e Estoque

**Serviços:**
- Lista com nome, preço, custo, garantia, status
- Criar / Editar / Inativar
- Filtro por categoria

**Produtos:**
- Lista com SKU, nome, estoque atual, estoque mínimo, preço, custo
- Alerta visual quando `estoque < estoque_minimo`
- Criar / Editar / Inativar
- Movimentar estoque (entrada/saída/ajuste manual)
- Ver histórico de movimentações
- Transferir para técnico / Devolver

---

### `#orcamentos` — Orçamentos

- Lista com status (badges: Rascunho, Enviado, Aprovado, Recusado, Expirado, Convertido)
- Filtro por status e busca por cliente
- **Criar**: seleciona cliente, aparelho, adiciona itens do catálogo, define validade e desconto
- **Detalhe**:
  - Mudar status (Aprovar / Recusar)
  - Enviar por WhatsApp (abre modal de confirmação)
  - Baixar PDF
  - Converter em OS (cria OS a partir do orçamento aprovado)

---

### `#suprimentos` — Suprimentos

**Fornecedores:**
- Lista com CNPJ, telefone, email
- Criar / Editar / Inativar

**Pedidos de Compra:**
- Lista com status (Pedido / Recebido / Cancelado)
- Criar pedido: selecionar fornecedor, adicionar itens com quantidade e custo
- Receber pedido: dá entrada no estoque dos produtos
- Cancelar pedido

**Reservas:**
- Lista de reservas de peças para OS
- Status: Reservado / Entregue / Consumido / Cancelado
- Criar reserva: associa produto a uma OS + técnico
- Marcar como entregue

---

### `#operacao` — Operação de Campo

Hub para operação logística:

**Estoque por Técnico:**
- Visão do material em cada veículo/técnico
- Transferir do estoque central para técnico
- Devolver de técnico para estoque central

**Contratos Preventivos:**
- Lista contratos com próxima visita destacada
- Gerar OS de visita preventiva (cria automaticamente OS com tipo `PREVENTIVA`)

**Orçamentos (visão rápida):**
- Lista orçamentos pendentes de aprovação

---

### `#tecnicos` — Equipe Técnica

- Lista técnicos com perfil e status
- **Cadastrar novo técnico**: nome, e-mail, senha provisória, perfil
- Técnico recebe credenciais e é instruído a trocar a senha no primeiro acesso

---

### `#whatsapp` — Central de Atendimento

Painel de chat integrado ao WhatsApp Cloud API.

**3 filas de conversas:**
- **Automação** — bot respondendo
- **Espera** — aguardando humano
- **Atendendo** — atendente ativo

**Por conversa:**
- Histórico completo de mensagens (entrada/saída)
- Campo de resposta com envio
- Botão "Assumir atendimento" (bot para, fila muda para Atendendo)
- Botão "Encerrar atendimento" (encerra conversa)
- Mover para outra fila

**Polling:** atualiza lista a cada 5-8 segundos (sem WebSocket hoje).

---

### `#config` — Configurações

**Permissões por usuário:**
- Lista todos os usuários da empresa
- Checkboxes para cada permissão granular
- Salvar individualmente ou em lote

**Checklists personalizados:**
- Seletor de tipo de serviço
- Editor de itens: nome, ordem, obrigatório, exige observação NC, exige foto
- Medição: campo, valor mínimo, valor máximo
- Adicionar / Remover / Reordenar itens
- Se existir modelo por empresa, sobrescreve o global

---

### `#conta` — Minha Conta

- Exibe nome, e-mail e perfil do usuário logado
- Formulário de troca de senha (senha atual + nova senha)
- Após troca: tokens anteriores são invalidados

---

## Serviço de API Web (`web/src/services/api.js`)

- Axios com `baseURL` configurada
- Interceptor de resposta: 401 → limpa localStorage e redireciona para Login
- Todos os requests incluem `Authorization: Bearer <token>`

---

## Melhorias Futuras — Web

> Ver também: [08-melhorias-futuras.md](./08-melhorias-futuras.md)

### Alta prioridade

**W1 — Autenticação por localStorage → HttpOnly Cookie**
O token JWT fica em `localStorage` no web, exposto a XSS. Migrar para cookie `HttpOnly; SameSite=Strict; Secure` gerado pela API elimina esse risco. Requer endpoint `POST /auth/logout` para limpar o cookie.

**W2 — Refresh token no web**
Assim como o mobile implementou renovação automática de sessão, o web precisa da mesma lógica no interceptor Axios. Hoje o usuário é deslogado quando o access-token expira (8h).

**W3 — Notificações em tempo real (WebSocket ou SSE)**
A central de WhatsApp hoje faz polling a cada 5-8s. Substituir por Server-Sent Events (SSE) reduz latência e carga no servidor. Também beneficia o PainelDespacho (atualização em tempo real quando técnico faz check-in).

**W4 — Exportação de relatórios para Excel/CSV**
No Dashboard e Relatórios, adicionar botão de exportação. Backend pode servir `text/csv` de queries específicas.

**W5 — Impressão de OS diretamente do painel**
No PainelDespacho ou na listagem de OS finalizadas, botão "Imprimir" que abre o PDF em nova aba.

**W6 — Drag-and-drop no mapa**
Em `MapaEquipe`, arrastar OS de um técnico para outro no mapa (hoje só possível no calendário).

**W7 — Dashboard personalizável (widgets)**
Permitir que o gestor escolha quais KPIs exibir e em qual ordem na tela de Dashboard.

**W8 — Histórico de atividade (feed de eventos)**
Sidebar ou página com feed em tempo real: "Técnico X fez check-in na OS #123", "OS #456 finalizada"...

### Média prioridade

**W9 — Multi-idioma (i18n)**
Internacionalização com `react-i18next`. Base do sistema é em português, mas o mercado de climatização tem empresas com equipes multilíngues.

**W10 — Modo escuro no painel web**
CSS variables + `prefers-color-scheme` media query + toggle manual.

**W11 — Responsividade mobile-first**
O painel não foi desenhado para celular. Adicionar breakpoints e layout adaptativo para uso em tablet (reuniões de gestão).

**W12 — Botão WhatsApp com template de lembrete**
No PainelDespacho, botão para enviar lembrete de agendamento ao cliente via WhatsApp (template pré-aprovado pela Meta).

**W13 — Relatório de inadimplência**
Tabela de OS finalizadas com saldo pendente acima de X dias, com botão de cobrança por WhatsApp.

**W14 — Integração com Google Calendar / Outlook**
Exportar agenda do técnico como iCal (`.ics`) para sincronizar com calendário pessoal.

**W15 — Foto interativa no detalhe da OS**
No modal de detalhes, galeria com lightbox de fotos, zoom e navegação.

### Baixa prioridade / Tech debt

**W16 — Migrar de hash routing para React Router v6**
O `App.jsx` usa hash-based routing manual. Migrar para `react-router-dom` com suporte a BrowserRouter (requer configuração de fallback no Nginx/servidor).

**W17 — Gerenciamento de estado global (Zustand ou React Query)**
Dados como lista de técnicos, catálogo e clientes são buscados múltiplas vezes. Implementar cache com React Query (TanStack) ou Zustand reduz requisições e melhora UX.

**W18 — Testes E2E (Playwright ou Cypress)**
Fluxos críticos: login, criar OS, reagendar, visualizar dashboard.

**W19 — Análise de bundle (vite-bundle-analyzer)**
O bundle atual não usa code splitting agressivo. Analisar e dividir melhor os chunks pode reduzir o tempo de carregamento inicial.

**W20 — Paginação no server-side**
`listarTodas()` no `OsModel` retorna todas as OS sem limite. Para empresas com muitas OS, implementar cursor pagination no backend e infinite scroll ou paginação numérica no frontend.
