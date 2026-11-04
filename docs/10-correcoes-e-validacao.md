# Correções e validação — 29/10/2026

## Implementado

- Dependência `expo-crypto` instalada na versão compatível com Expo 57.
- Fila offline preserva operações após cinco falhas, pausa o envio automático e permite reenvio manual pela central de sincronização. Falhas interrompem o lote para impedir execução de ações dependentes fora de ordem. Sincronizações simultâneas compartilham a mesma execução.
- Cache e fila novos são separados por empresa e usuário. Registros antigos sem identificação permanecem preservados e isolados como `legado`; não são atribuídos automaticamente à conta atual. A recuperação desses registros exige identificação da conta de origem e procedimento específico, ainda pendente.
- Migração SQLite tolera coluna preexistente sem deixar de criar o índice de idempotência.
- Web usa access token em memória e refresh em cookie HttpOnly; remove credenciais persistidas pela versão anterior. Ao recarregar, restaura a sessão pelo cookie. Falhas transitórias de refresh não apagam as credenciais mobile.
- JWTs distinguem access, refresh e arquivo. Sessões ficam no PostgreSQL, com hash de refresh, rotação atômica e revogação de acesso no logout/troca de senha. Refresh consumido é rejeitado.
- `/os/:id/agendar` exige permissão de reagendamento e perfil gestor/admin; valida conflitos. Retornos persistem a duração validada. Alterações de agenda usam lock transacional por empresa/técnico para serializar validação e escrita.
- Exportação da conta de técnico não inclui a base empresarial de clientes.
- Evidências e PDFs exigem links assinados por arquivo/empresa, com validade de 15 minutos nas respostas autenticadas e cache `no-store`. Links do PDF enviados ao WhatsApp duram sete dias. Arquivos antigos sem assinatura deixam de abrir diretamente; obtenha um novo link na aplicação. O mobile renova o link ao abrir/compartilhar PDF.
- Migração aplica schema e patches ordenados em transação, com controle de aplicação e lock. Corrigido trecho SQL inválido no schema original, na transição de usuários para clientes.
- Finalização grava tarefa de documento na mesma transação da OS. Worker busca tarefas persistidas com `SKIP LOCKED`, tenta novamente após falha e recupera tarefas abandonadas depois de dez minutos. Detalhes da OS incluem status/tentativas do documento. A geração/envio ocorre após a resposta de finalização; `pdf_url` pode vir nula até o processamento.

## Implantação

1. Faça backup do banco e valide a restauração em ambiente separado.
2. Pare a versão anterior da API; execute `npm ci`, `npm --prefix mobile ci` e `npm --prefix web ci` conforme os componentes publicados.
3. Execute `npm run migrate` antes de iniciar a nova API. Isso cria `lgpd_auditoria`, `sessoes` e `fila_documentos`. Não execute apenas migration.sql manualmente.
4. Configure `APP_URL` com a URL pública HTTPS da API e `CORS_ORIGIN` com as origens explícitas do painel, separadas por vírgula. Cookie `SameSite=Strict` exige web e API no mesmo site; preferir servir o painel em `/painel` na própria API. Hospedagem em sites distintos exige configuração adicional de sessão/proxy.
5. Publique API, painel e mobile de forma coordenada. Tokens anteriores não possuem tipo/sessão e exigem novo login. Mobile mantém dados offline identificados entre logins, mas precisa de conexão para revogar a sessão no logout.
6. Inicie via `npm start`; o worker é iniciado junto ao servidor. Apenas instanciar `createApp()` não inicia o processamento de documentos.

Nenhuma migração foi executada contra o banco configurado no ambiente durante estas correções.

## Validação e limites

- Testes de API, autorização, tipos de JWT, refresh/rotação/logout, links de arquivo, exportação e recuperação de tarefas.
- SQLite real em memória: inicialização repetida, índice, isolamento de conta, preservação de legado. Teste da fila verifica cinco falhas sem perda e reenvio manual.
- Build do painel e exportação web do mobile validados. Ainda é necessária homologação em dispositivo Android/iOS e navegador com o domínio de produção.
- Teste PostgreSQL usa exclusivamente `TEST_DATABASE_URL`, cria schema temporário e verifica instalação/reaplicação e conflito concorrente. CI ganhou serviço PostgreSQL 16. Localmente é ignorado quando essa variável não existe; não foi executado contra PostgreSQL neste ambiente.
- Entrega de WhatsApp tem semântica de pelo menos uma tentativa: reinício após aceite da Meta e antes da confirmação local pode causar reenvio. Não há garantia de entrega exatamente uma vez. Sem integração configurada, conclui somente a geração do PDF.
- A fila ainda não oferece deduplicação de todas as operações de negócio no servidor; uma resposta perdida pode exigir conferência antes de reenvio manual. Fotos possuem `client_uuid`.
- Armazenamento de objetos, SSE, alertas de contratos/estoque, relatórios e recuperação assistida do legado permanecem próximos incrementos. Auditoria atualizada de dependências e testes completos de restauração/carga permanecem pendentes.
