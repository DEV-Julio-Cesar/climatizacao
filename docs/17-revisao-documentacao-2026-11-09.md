# Revisão da documentação — 09/11/2026

Comparação dos documentos com as fontes locais da API, painel e aplicativo. Esta revisão altera somente documentação. Configuração disponível no repositório não comprova implantação em produção; os resultados dos lotes anteriores permanecem registros históricos.

Entrega posterior nesta sessão: [LGPD e proteção de dados](./18-lgpd-protecao-dados.md), com alterações na API/painel, protocolos e matriz de tratamento/retenção. O escopo documental acima se refere à revisão inicial.

## Estado atual

| Área | Implementação encontrada | Referências no código |
|---|---|---|
| Sessões | Access JWT em memória no painel, refresh em cookie HttpOnly, sessões revogáveis e permissões consultadas no banco a cada requisição | `web/src/context/SessionContext.jsx`, `src/controllers/AuthController.js`, `src/middlewares/authMiddleware.js` |
| Recuperação de senha | Solicitação e redefinição no web/mobile, token de uso único, fila cifrada e worker SMTP | `src/services/RecuperacaoSenhaService.js`, `src/services/EmailWorker.js` |
| Tempo real | SSE no painel com LISTEN/NOTIFY PostgreSQL, reconexão e consulta periódica de contingência; mobile usa push e atualização das telas | `src/services/EventoService.js`, `web/src/services/eventos.js`, `web/src/hooks/useRealtimeRefresh.js` |
| Arquivos | Fotos/PDFs em BYTEA; acesso por link assinado temporário, vinculado ao arquivo e à empresa, com cache privado sem armazenamento | `src/services/ArquivoService.js`, `src/app.js` |
| Finalização | Baixa de estoque e inclusão de tarefa persistente na transação; PDF e WhatsApp processados posteriormente | `src/controllers/OsController.js`, `src/services/DocumentoWorker.js` |
| Offline | SQLite por empresa/usuário, legado isolado e recuperação explícita; falhas preservam o item e interrompem o lote; pausa automática após cinco tentativas | `mobile/src/database/sqlite.js`, `mobile/src/services/SyncService.js`, `src/controllers/OfflineController.js` |
| Reenvios | Mutações de OS usam `Idempotency-Key`; fotos usam `client_uuid`; pagamentos e movimentos de estoque também têm proteção de reenvio | `src/services/OperacaoService.js`, `src/controllers/FotoController.js`, `src/controllers/FinanceiroController.js`, `src/controllers/CatalogoController.js` |
| Mobile | Nome do assinante/PDF, galeria com zoom, tema parcial, ações de PDF de orçamento e estoque com entrada/saída/ajuste e histórico | `mobile/src/components/OrcamentoPdfActions.js`, `mobile/src/services/orcamentoPdf.js`, `mobile/src/components/EstoqueProduto.js`, documentos 14 e 16 |
| WhatsApp | Roteamento pelo número destinatário, recepção configurável, simulador, resumo da triagem e passagem humana; sem agendamento automático | [Entrega 22](./22-whatsapp-recepcao.md) |
| Operação | Workers de documentos, alertas, e-mail e respostas do robô WhatsApp, além do listener de eventos, iniciam em `npm start` | `server.js` |

## Pendências consolidadas

- Homologar PostgreSQL real, migrações, concorrência, backup/restauração, cookies no domínio publicado, SMTP, Meta, proxy SSE e uso em aparelho. A existência de testes/configuração não comprova esses resultados.
- Completar tema das telas secundárias, testes de interface/E2E, paginação das listas e navegação por deep links.
- Avaliar biometria, agendamento guiado no bot, armazenamento externo e retenção de binários e operações idempotentes.
- Integrações de cobrança, fiscal e ERP permanecem evolução de produto. Relatório de saldo pendente não representa vencimento formal de cobrança.

## Como interpretar os documentos

Os documentos 01–07 descrevem os módulos; 08 reúne o backlog com estados de implementação. Os documentos 09, 10, 12 e `qa-qc-analise.md` registram análises de uma versão anterior: seus achados não devem ser tratados automaticamente como defeitos atuais. Os lotes 13–16 registram entregas posteriores, também com limites de validação próprios.

Para desenvolvimento, use [validação rápida](./11-validacao-rapida.md). Para publicação, execute `npm run migrate` antes de iniciar a API. O Render faz isso no `startCommand`; o `Dockerfile` inicia apenas `node server.js`, portanto a migração precisa ser executada separadamente no fluxo de implantação.
