# Documentação ClimaSaaS

Índice central da documentação técnica do sistema ClimaSaaS —  
plataforma SaaS para gestão de serviços de climatização (ar-condicionado).

Estado atual: [revisão de 09/11/2026](./17-revisao-documentacao-2026-11-09.md).

Histórico: [correções, validação e implantação](./10-correcoes-e-validacao.md).
Validação de desenvolvimento: [comando rápido e CI paralelo](./11-validacao-rapida.md).
Pendências históricas: [pendências atuais após revisão do código](./12-pendencias-atuais.md).
Entrega do lote 13: [correções e novos fluxos do lote 13](./13-implementacao-pendencias.md).
Mobile atualizado: [assinatura com nome, galeria e tema](./14-mobile-assinatura-galeria-tema.md).
Recuperação e tempo real: [Gmail, redefinição de senha e SSE](./15-recuperacao-senha-tempo-real.md).

---

## Entregas e revisão recentes

- [22 — Recepção WhatsApp, configuração, simulador e passagem humana](./22-whatsapp-recepcao.md).

- [21 — Homologação de interface, regressões e dependências](./21-homologacao-interface.md).

- [20 — Privacidade nativa, filtros e histórico web, reenvio de protocolos](./20-privacidade-web-mobile.md).

- [19 — Homologação e proteção dos dados offline](./19-homologacao-protecao-offline.md).

- [18 — LGPD, retenção, direitos e incidentes](./18-lgpd-protecao-dados.md).

- [14 — Assinatura, galeria e tema](./14-mobile-assinatura-galeria-tema.md).
- [15 — Recuperação de senha e SSE](./15-recuperacao-senha-tempo-real.md).
- [16 — Estoque mobile](./16-estoque-mobile.md).
- [17 — Estado atual e pendências](./17-revisao-documentacao-2026-11-09.md).
- [09 — Análise histórica](./09-analise-prioridades-2026-10-29.md), [11 — Validação rápida](./11-validacao-rapida.md) e [QA/QC histórico](./qa-qc-analise.md).

## Arquivos desta pasta

| # | Arquivo | Conteúdo | Leitura recomendada para |
|---|---|---|---|
| 01 | [01-visao-geral.md](./01-visao-geral.md) | O que é o sistema, arquitetura, perfis, stack e segurança | Qualquer pessoa nova no projeto |
| 02 | [02-banco-de-dados.md](./02-banco-de-dados.md) | Todas as 25+ tabelas, colunas, relacionamentos, índices e patches | Backend, DBA |
| 03 | [03-api-backend.md](./03-api-backend.md) | Todas as rotas, middlewares, autenticação, validators, services | Backend, integrações |
| 04 | [04-fluxo-os.md](./04-fluxo-os.md) | Passo a passo completo de uma OS do início ao fim | Produto, onboarding técnico |
| 05 | [05-mobile.md](./05-mobile.md) | App mobile: telas, navegação, offline, serviços + melhorias futuras | Mobile, produto |
| 06 | [06-web.md](./06-web.md) | Painel web: páginas, funcionalidades + melhorias futuras | Web, produto |
| 07 | [07-integracoes.md](./07-integracoes.md) | WhatsApp, Push, Maps, PDF, ViaCEP, QR Code | Backend, integrações externas |
| 08 | [08-melhorias-futuras.md](./08-melhorias-futuras.md) | Backlog técnico consolidado com prioridades para web, mobile e backend | Produto, gestão técnica |

---

## Arquitetura em uma imagem

```
┌────────────────────────────────────────────────────────────────────┐
│                          ClimaSaaS                                 │
│              SaaS multi-tenant para climatização                   │
└───────────────────────┬────────────────────────┬───────────────────┘
                        │                        │
           ┌────────────▼────────────┐  ┌────────▼────────────────┐
           │   App Mobile (Expo)     │  │   Painel Web (Vite)     │
           │   React Native 0.86     │  │   React 19              │
           │                         │  │                         │
           │  • 30+ telas            │  │  • Páginas por domínio           │
           │  • Offline (SQLite)     │  │  • Calendário despacho  │
           │  • GPS + Camera         │  │  │  • Mapa da equipe    │
           │  • Push Notifications   │  │  • Central WhatsApp     │
           │  • Sync idempotente     │  │  • Relatórios           │
           └────────────┬────────────┘  └────────┬────────────────┘
                        │                        │
                        └────────────┬───────────┘
                                     │ REST API (JWT Bearer)
                        ┌────────────▼────────────┐
                        │   API REST (Node.js 22)  │
                        │   Express 4              │
                        │                          │
                        │  • Autenticação JWT       │
                        │  • RBAC granular         │
                        │  • Rate limiting         │
                        │  • Logger estruturado    │
                        │  • LGPD endpoints        │
                        └────────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐
                        │   PostgreSQL (Neon)      │
                        │   25+ tabelas            │
                        │   Multi-tenant           │
                        └─────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                       │
    ┌─────────▼──────┐   ┌──────────▼──────┐   ┌──────────▼──────┐
    │  WhatsApp      │   │  Expo Push       │   │  PDF (pdfkit)   │
    │  Cloud API     │   │  Notifications   │   │  armazenado no  │
    │  (Meta v24.0)  │   │  (exp.host)      │   │  PostgreSQL     │
    └────────────────┘   └─────────────────┘   └─────────────────┘
```

---

## Fluxo resumido de uma OS

```
Criação → [Notificação push] → Técnico a caminho
       → Check-in (GPS)
       → Fotos de evidência
       → Relatório técnico (diagnóstico + checklist + medições + peças)
       → Assinatura do cliente
       → Check-out (GPS)
       → Finalização → [Baixa de estoque + tarefa persistente]
       → [Worker gera PDF] → [WhatsApp se configurado]
```

Detalhado em [04-fluxo-os.md](./04-fluxo-os.md).

---

## Outros documentos do projeto

| Arquivo | Conteúdo |
|---|---|
| [10-correcoes-e-validacao.md](./10-correcoes-e-validacao.md) | Correções recentes, validação e sequência de implantação |
| `Dockerfile` | Imagem Docker multi-stage para containerização |
| `.github/workflows/deploy-aws.yml` | CI/CD GitHub Actions → AWS ECS |
| `src/database/migration.sql` | Schema completo do banco |
| `src/database/patches/` | Patches SQL incrementais |
| `.env.example` | Variáveis de ambiente necessárias |
