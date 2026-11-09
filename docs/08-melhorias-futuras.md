# 08 — Backlog de Melhorias Futuras

Consolidação de todas as melhorias identificadas para o sistema.  
Itens do mobile também estão em [05-mobile.md](./05-mobile.md).  
Itens do web também estão em [06-web.md](./06-web.md).

## Etapa atual ? 08/11/2026

As correcoes de seguranca e a preparacao local da publicacao estao registradas em [proxima-etapa-publicacao.md](proxima-etapa-publicacao.md). A suite atual possui 96 testes aprovados; CI e deploy foram preparados para usa-los como bloqueio antes da publicacao. O proximo criterio de aceite e homologar configuracao, migracoes e nova compilacao mobile. As tabelas abaixo continuam como historico e nao substituem esse estado.

## Estado auditado — 31/10/2026

Esta seção é a fonte de verdade para execução. As tabelas históricas abaixo
continuam registrando o escopo original, mas podem descrever itens já entregues.

| Frente | Estado | Evidência / próximo critério de aceite |
|---|---|---|
| Backlog e documentação | ✅ Concluído | Estado reconciliado com o código e CI existente |
| Instalação, testes e CI | ✅ Concluído | `npm install`, 44/44 testes da API e build Vite aprovados; CI executa API, web e export Expo |
| Sessões persistidas e rotação | ✅ Concluído | Tabela `sessoes`, hash do refresh, rotação atômica e revogação por sessão |
| Cookie HttpOnly no painel | ✅ Concluído | Login web não recebe refresh no JSON; refresh e logout usam cookie `HttpOnly; SameSite=Strict` |
| Testes da sincronização offline/finalização | ✅ Concluído | FIFO, falhas, limite, assinatura, checkout e status final idempotentes e retomáveis |
| Refatoração das páginas web grandes | ✅ Concluído | Componentes, utilitários e dados separados em `Clientes`, `Suprimentos` e `PainelDespacho` |
| Paginação e cache web | ✅ Concluído | Clientes usam cursor/infinite query; despacho usa cache e invalidação com TanStack Query |
| SSE | ✅ Concluído | Stream autenticado multiempresa, heartbeat e reconexão atualizam WhatsApp e despacho sem polling |
| S3/R2 | ✅ Concluído | Provider S3/R2 opcional, fallback BYTEA, leitura retrocompatível e compensação em falha de banco |
| Paginação de O.S. | ✅ Concluído | Cursor, filtros validados e consumidores web sem consultas ilimitadas |
| Históricos paginados | ✅ Concluído | O.S. finalizadas e atendimentos por cliente usam cursor e carregamento incremental |
| Exportações, inadimplência, lembretes e PIX | 🚧 Parcial | CSV, inadimplência e lembrete WhatsApp entregues; PIX em implementação |
| Tema escuro e acessibilidade | 🚧 Parcial | Infraestrutura mobile existe; faltam telas e auditoria de acessibilidade |

### Itens já entregues que permaneciam marcados como futuros

- **B2**: a revogação é persistida em PostgreSQL por sessão; Redis não é
  necessário para a escala atual.
- **B17**: existem 44 testes automatizados de API, migração e recuperação de senha.
- **M2**: lembretes locais de agenda já são sincronizados pelo app.
- **M15**: o scheme `climasaas` já está configurado em `app.config.js`.
- **W1/W2**: cookie HttpOnly e refresh automático estão implementados.
- O modo escuro mobile está em migração gradual, portanto **M1** está parcial.

---

## Legenda de Prioridade

| Símbolo | Prioridade | Critério |
|---|---|---|
| 🔴 | Alta | Impacto direto em segurança, receita ou retenção |
| 🟡 | Média | Melhora significativa de UX ou operação |
| 🟢 | Baixa / Tech debt | Qualidade de código, escalabilidade futura |

---

## Backend

### Segurança e Infraestrutura

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| B1 | 🔴 | Migrar fotos de BYTEA para S3/R2 | Fotos e PDFs armazenados em `BYTEA` no PostgreSQL. Funciona bem em pequena escala, mas vai saturar o banco com volume alto. Migrar para AWS S3 ou Cloudflare R2, armazenar apenas a chave/URL no banco. |
| B2 | 🔴 | Blocklist de refresh tokens (Redis) | Hoje o único mecanismo de invalidação é `senha_alterada_em`. Um refresh token roubado permanece válido até expirar. Implementar blocklist em Redis: ao trocar senha ou fazer logout, adiciona o `jti` (JWT ID) ao set expirado. |
| B3 | 🔴 | Rate limiting por usuário (não só por IP) | O rate limiting atual é por IP. Atacantes com múltiplos IPs podem burlar. Adicionar limite por `email` no endpoint de login. |
| B4 | 🟡 | WebSocket / SSE para tempo real | WhatsApp polling a cada 5-8s é ineficiente. Implementar Server-Sent Events para o painel web: nova mensagem, mudança de status de OS, check-in de técnico. |
| B5 | 🟡 | Multi-tenant WhatsApp completo | `WHATSAPP_EMPRESA_ID` hardcoded limita a uma empresa por instância. Criar tabela `empresas_whatsapp(numero, empresa_id)` para roteamento correto. |
| B6 | 🟡 | Job de alertas de estoque mínimo | Quando `estoque < estoque_minimo`, nenhuma notificação automática é gerada. Implementar um cron job (ex.: `node-cron`) que roda a cada hora e insere notificações na tabela `notificacoes`. |
| B7 | 🟡 | Job de contratos a vencer | Similar ao anterior: verificar `contratos.proxima_visita` e notificar gestores automaticamente. |
| B8 | ✅ | Paginação cursor-based em `/os/todas` | Entregue com `cursor`, `limit`, filtros de status/busca e carregamento paginado no despacho e suprimentos. |
| B9 | 🟢 | Migrar logs para serviço externo | Logger atual emite JSON para stdout. Integrar com Datadog, Logtail ou AWS CloudWatch para alertas automáticos em erros 5xx. |

### Funcionalidades

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| B10 | 🔴 | Bot WhatsApp com agendamento automático | O bot atual só triagem básica. Implementar fluxo completo: cliente informa problema → bot sugere data disponível → confirma → cria OS automaticamente. |
| B11 | 🟡 | API de relatórios configuráveis | Hoje o dashboard tem KPIs fixos. Permitir que o gestor selecione período, técnico, tipo de serviço nos filtros da API de relatórios. |
| B12 | ✅ | Endpoint de exportação CSV | Entregue para OS, pagamentos e movimentações, com filtros, isolamento por empresa e proteção contra fórmulas. |
| B13 | 🟡 | Webhook de saída (outbound) | Ao finalizar OS, notificar sistemas externos (ERP, CRM) via webhook configurável por empresa. |
| B14 | 🟡 | Integração PIX (geração de QR Code) | Gerar QR Code PIX estático/dinâmico para cobranças (`pixqrcode` ou API do Banco Central). Enviar ao cliente por WhatsApp. |
| B15 | 🟢 | Módulo de relatório fiscal (NF-se) | Emissão de Nota Fiscal de Serviço Eletrônica integrada à prefeitura local. Necessita integração com provedor (e.g. FocusNFe, eNotas). |
| B16 | 🟢 | Assinatura digital qualificada | Integrar com DocuSign ou Clicksign para validade jurídica das assinaturas coletadas. |

### Qualidade de Código

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| B17 | 🟡 | Testes de integração da API | Projeto tem estrutura `test/` mas sem cobertura de testes. Adicionar testes com `node:test` (já configurado no `package.json`) para os fluxos críticos: login, criar OS, upload de foto, finalizar OS. |
| B18 | 🟡 | Schema Zod para todos os controllers | Validators Zod existem para OS e cadastro. Adicionar para financeiro (orçamentos, pagamentos), suprimentos e gestão. |
| B19 | 🟢 | TypeScript no backend | Migração gradual para TypeScript melhoraria autocompletar, refatorações seguras e detecção de erros em tempo de compilação. |
| B20 | 🟢 | OpenAPI / Swagger | Gerar documentação interativa da API automaticamente. Útil para integração com sistemas externos e onboarding de novos desenvolvedores. |

---

## Mobile

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| M1 | 🔴 | Modo escuro | `useColorScheme` + paleta alternativa em `theme.js` |
| M2 | 🔴 | Notificações locais de agendamento | Lembretes locais 30 min antes de cada OS (sem push da API) |
| M3 | 🟡 | Biometria no login | `expo-local-authentication` para impressão digital / Face ID |
| M4 | 🟡 | Pré-visualização de fotos antes do upload | Revisar antes de confirmar envio na `CameraOS` |
| M5 | 🟡 | Assinatura com nome do cliente | Campo de nome em `AssinaturaOS`, impresso no PDF |
| M6 | 🟡 | Exportar OS como PDF no mobile | `expo-sharing` para compartilhar PDF da OS finalizada |
| M7 | 🟡 | Scan de código de barras de produtos | Câmera para adicionar peças por código em `ExecucaoOS` |
| M8 | 🟡 | Filtro de agenda por tipo de serviço | Chips adicionais em `AgendaMapa` |
| M9 | 🟡 | Galeria de fotos com zoom | Pinch-to-zoom com `react-native-reanimated` |
| M10 | 🟡 | Histórico de OS no mapa | Mapa com locais atendidos nos últimos N dias |
| M11 | 🟢 | Migrar para Expo Router | File-based routing, reduz boilerplate de navegação |
| M12 | 🟢 | Testes automatizados | Jest + React Native Testing Library para fluxos críticos |
| M13 | 🟢 | Paginação na lista de clientes | Infinite scroll em vez de carregar tudo |
| M14 | 🟢 | Suporte a iOS | Configurações de Info.plist, permissões, ícone para iOS |
| M15 | 🟢 | Deep links formalizados no app.config.js | Declarar o scheme `climasaas://` corretamente |
| M16 | 🟢 | Checklist de voz | `expo-speech` para responder checklist com mãos livres |

---

## Web (Painel)

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| W1 | 🔴 | Token em HttpOnly Cookie | Elimina exposição a XSS; requer `POST /auth/logout` na API |
| W2 | 🔴 | Refresh token no web | Renovação automática no interceptor Axios (como o mobile faz) |
| W3 | 🔴 | Notificações em tempo real (SSE) | Substituir polling do WhatsApp e atualizar despacho em tempo real |
| W4 | ✅ | Exportação de relatórios CSV/Excel | Downloads de OS, pagamentos e estoque no Dashboard |
| W5 | 🟡 | Drag-and-drop no mapa | Arrastar OS entre técnicos em `MapaEquipe` |
| W6 | ✅ | Lembrete WhatsApp de agendamento | Botão no PainelDespacho com template Meta configurável |
| W7 | ✅ | Relatório de inadimplência | OS finalizadas com saldo pendente, resumo e tempo em aberto |
| W8 | 🟡 | Responsividade para tablet | Breakpoints e layout adaptativo |
| W9 | 🟡 | Foto interativa com lightbox | Galeria de fotos com zoom no detalhe de OS |
| W10 | 🟡 | Dashboard personalizável | Gestor escolhe widgets e ordem |
| W11 | 🟢 | Migrar para React Router v6 | Substituir hash routing manual |
| W12 | 🟢 | React Query / TanStack Query | Cache de dados, deduplicação de requests, invalidação automática |
| W13 | 🟢 | Testes E2E (Playwright) | Fluxos: login, criar OS, reagendar, dashboard |
| W14 | 🟢 | Modo escuro | CSS variables + `prefers-color-scheme` |
| W15 | 🟢 | Análise de bundle | `vite-bundle-analyzer` para otimizar chunks |
| W16 | 🟢 | Integração Google Calendar | Exportar agenda como iCal |
| W17 | 🟢 | Feed de atividade (live feed) | "Técnico X fez check-in na OS #Y" em tempo real |
| W18 | 🟢 | Multi-idioma (i18n) | `react-i18next` para suporte a inglês e espanhol |

---

## Resumo por Impacto

### O que fazer primeiro (maior impacto, menor esforço)

1. Testes da sincronização offline e da finalização de OS
2. Refatoração segura das três maiores páginas web
3. Paginação por cursor e cache de consultas
4. SSE para WhatsApp e despacho
5. Migração gradual de fotos e PDFs para armazenamento de objetos

### O que evitar adiar por muito tempo

1. **B1** — Migração de BYTEA para S3: quanto mais fotos acumulam no banco, mais caro e lento fica a migração futura
2. Testes mobile: a fila offline ainda não possui cobertura automatizada suficiente
3. Paginação: listagens sem limite aumentam custo e tempo de resposta com o crescimento
