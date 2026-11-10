# 08 — Backlog de Melhorias Futuras

> Atualização de 29/10/2026: este é o backlog histórico. Consulte [correções e implantação](./10-correcoes-e-validacao.md) para o estado atual de sessões, arquivos, sincronização, agenda, testes e migrações. Refresh web, tema mobile, lembretes e prévia de fotos já possuem implementação.

Consolidação de todas as melhorias identificadas para o sistema.  
Itens do mobile também estão em [05-mobile.md](./05-mobile.md).  
Itens do web também estão em [06-web.md](./06-web.md).

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
| B2 | Implementado | Sessoes revogaveis | PostgreSQL guarda hash do refresh, rotacao e revogacao no logout/troca de senha. Redis nao e requisito. |
| B3 | Implementado | Limite por conta e IP | Login possui limite adicional por e-mail normalizado. Estado ainda e local a cada instancia. |
| B4 | Implementado/homologar | Tempo real no painel | SSE com LISTEN/NOTIFY, isolamento por empresa e fallback periodico. Configurar conexao direta e proxy. |
| B5 | Implementado/configurar | WhatsApp por empresa | Numero destinatario identifica a empresa; env vars guardam tokens. Operador precisa configurar contas e homologar na Meta. |
| B6 | Implementado | Alertas de estoque minimo | Worker horario com destinatarios gestores e chave diaria de deduplicacao. |
| B7 | Implementado | Alertas de visitas preventivas | Worker gera alertas de visitas proximas e atrasadas sem depender da tela. |
| B8 | 🟢 | Paginação cursor-based em `/os/todas` | `listarTodas()` retorna todas as OS sem limite. Para empresas com volume alto, implementar `cursor` + `limit` no backend e infinite scroll no frontend. |
| B9 | 🟢 | Migrar logs para serviço externo | Logger atual emite JSON para stdout. Integrar com Datadog, Logtail ou AWS CloudWatch para alertas automáticos em erros 5xx. |

### Funcionalidades

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| B10 | 🔴 | Bot WhatsApp com agendamento automático | O bot atual só triagem básica. Implementar fluxo completo: cliente informa problema → bot sugere data disponível → confirma → cria OS automaticamente. |
| B11 | Implementado | Relatorios configuraveis | Inicio/fim, tecnico e tipo de servico no dashboard/API. |
| B12 | Parcial | Exportacao CSV | Ordens, totais pagos e saldos disponiveis em CSV; exportacoes de movimentos e pagamentos individuais permanecem pendentes. |
| B13 | 🟡 | Webhook de saída (outbound) | Ao finalizar OS, notificar sistemas externos (ERP, CRM) via webhook configurável por empresa. |
| B14 | 🟡 | Integração PIX (geração de QR Code) | Gerar QR Code PIX estático/dinâmico para cobranças (`pixqrcode` ou API do Banco Central). Enviar ao cliente por WhatsApp. |
| B15 | 🟢 | Módulo de relatório fiscal (NF-se) | Emissão de Nota Fiscal de Serviço Eletrônica integrada à prefeitura local. Necessita integração com provedor (e.g. FocusNFe, eNotas). |
| B16 | 🟢 | Assinatura digital qualificada | Integrar com DocuSign ou Clicksign para validade jurídica das assinaturas coletadas. |

### Qualidade de Código

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| B17 | Parcial | Testes de integracao | Suites de API, dominio, SQLite e fila; PostgreSQL opcional no CI. Homologacao em banco real e E2E ainda necessarias. |
| B18 | 🟡 | Schema Zod para todos os controllers | Validators Zod existem para OS e cadastro. Adicionar para financeiro (orçamentos, pagamentos), suprimentos e gestão. |
| B19 | 🟢 | TypeScript no backend | Migração gradual para TypeScript melhoraria autocompletar, refatorações seguras e detecção de erros em tempo de compilação. |
| B20 | 🟢 | OpenAPI / Swagger | Gerar documentação interativa da API automaticamente. Útil para integração com sistemas externos e onboarding de novos desenvolvedores. |

---

## Mobile

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| M1 | Parcial | Tema mobile ampliado | Navegacao e nove telas principais migradas, alem de Login/Perfil. Telas secundarias ainda precisam migrar. Ver lote 14. |
| M2 | Implementado/homologar | Lembretes locais | Escopo por conta e agenda completa; validar em aparelho e em todos os caminhos de saida. |
| M3 | 🟡 | Biometria no login | `expo-local-authentication` para impressão digital / Face ID |
| M4 | Implementado/homologar | Previa de fotos | CameraOS possui revisao antes do envio. |
| M5 | Implementado/homologar | Nome na assinatura e PDF | Campo na tela, metadados persistidos e nome impresso junto da assinatura; registros antigos permanecem compativeis. |
| M6 | Implementado/homologar | Compartilhar PDF | Finalizadas busca link atualizado e compartilha via expo-sharing. |
| M7 | 🟡 | Scan de código de barras de produtos | Câmera para adicionar peças por código em `ExecucaoOS` |
| M8 | 🟡 | Filtro de agenda por tipo de serviço | Chips adicionais em `AgendaMapa` |
| M9 | Implementado/homologar | Galeria com zoom | Tela cheia, pinca, arraste, dois toques e controles; verificar gestos em aparelho. |
| M10 | 🟡 | Histórico de OS no mapa | Mapa com locais atendidos nos últimos N dias |
| M11 | 🟢 | Migrar para Expo Router | File-based routing, reduz boilerplate de navegação |
| M12 | 🟢 | Testes automatizados | Jest + React Native Testing Library para fluxos críticos |
| M13 | 🟢 | Paginação na lista de clientes | Infinite scroll em vez de carregar tudo |
| M14 | 🟢 | Suporte a iOS | Configurações de Info.plist, permissões, ícone para iOS |
| M15 | Parcial | Deep links | Scheme climasaas declarado; navegacao por links e homologacao ainda pendentes. |
| M16 | 🟢 | Checklist de voz | `expo-speech` para responder checklist com mãos livres |

---

## Web (Painel)

| ID | Prioridade | Melhoria | Detalhe |
|---|---|---|---|
| W1 | Implementado | Sessao web | Refresh em cookie HttpOnly, access em memoria e contexto de usuario/permissoes. |
| W2 | Implementado | Refresh web | Renovacao automatica com mutex e restauracao pelo cookie. |
| W3 | Implementado/homologar | Notificacoes de atualizacao | WhatsApp, Despacho, Mapa e Dashboard recebem avisos SSE; REST continua aplicando autorizacao. |
| W4 | Parcial | CSV/Excel | Download CSV no dashboard, com neutralizacao de formulas; XLSX nativo nao implementado. |
| W5 | 🟡 | Drag-and-drop no mapa | Arrastar OS entre técnicos em `MapaEquipe` |
| W6 | 🟡 | Lembrete WhatsApp de agendamento | Botão no PainelDespacho para enviar template de lembrete |
| W7 | Parcial | Recebimentos pendentes | Lista de saldos em OS finalizadas; vencimento formal e cobranca automatica nao implementados. |
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

## Proxima sequencia

Estado detalhado e implantacao: [lote 13](./13-implementacao-pendencias.md).

1. Homologar migracoes, dispositivo, dominio e contas WhatsApp.
2. Homologar recuperação de senha/SMTP do lote 15; completar tema e testes de interface.
3. Homologar SSE/proxy do lote 15; implementar agendamento guiado do bot e paginação.
4. Armazenamento externo e integracoes de cobranca/fiscal conforme necessidade.
