# Análise da aplicação e próximas melhorias

> Registro histórico. Consulte a [revisão de 09/11/2026](./17-revisao-documentacao-2026-11-09.md) para o estado atual. Achados e resultados abaixo pertencem à versão analisada na época.


Data: 29/10/2026. Análise do código local e da documentação, sem alteração das regras da aplicação. Havia alterações prévias em package.json, package-lock.json, src/app.js e AuthController.js; os achados refletem esse estado local.

## Validação realizada

- API: 36 testes passaram (`npm.cmd test`). As consultas e transações são substituídas por mocks; isso não comprova integridade ou concorrência em PostgreSQL real.
- Sintaxe: `npm.cmd run check` passou; esse comando verifica somente server.js e src/app.js.
- Web: build de produção passou. A primeira tentativa falhou por restrição de subprocesso no sandbox; a execução autorizada fora dele passou.
- Mobile: `npm.cmd --prefix mobile run check` falhou ao resolver `expo-crypto`, importado em mobile/src/database/sqlite.js e ausente em mobile/package.json.
- Não houve validação visual em navegador, execução em aparelho, acesso à produção, migração de banco ou auditoria de vulnerabilidades atualizada.

## Prioridades confirmadas no código

| Prioridade | Achado e evidência | Próxima ação e critério de conclusão |
|---|---|---|
| P0 | Mobile não compila: sqlite.js importa expo-crypto sem dependência declarada. | Declarar uma versão compatível com o Expo do projeto, atualizar lockfile e executar novamente a exportação; validar também a inicialização em aparelho. |
| P0 | Perda de operações offline: SyncService.js chama descartar após cinco falhas; sqlite.js executa DELETE. Isso também ocorre com erros de rede/5xx. | Preservar payload e evidências em estado de falha, permitir reenvio e descarte explícito. Cinco indisponibilidades não podem apagar relatório, assinatura ou finalização. |
| P1 | Cache e fila SQLite não têm empresa_id/usuario_id. O logout em mobile/App.js remove credenciais, mas não particiona o banco local. | Vincular registros à conta e filtrar leitura e sincronização pela sessão ativa. Testar troca de empresa/usuário no mesmo dispositivo sem expor ou reenviar dados da conta anterior. |
| P1 | Sessão web parcialmente migrada: backend define refresh cookie HttpOnly, mas web/src/services/api.js continua lendo e gravando access e refresh tokens no localStorage. Logout em App.jsx só limpa armazenamento local; /logout apenas limpa cookie, sem revogação no servidor. | Completar contrato web com cookie e credenciais, retirar refresh do armazenamento JavaScript e implementar sessões revogáveis/rotação com detecção de reutilização. Validar logout e cenários de hospedagem separada. |
| P1 | Access e refresh usam mesma chave/algoritmo e não têm claim de tipo. refresh aceita qualquer JWT válido com os IDs, e authMiddleware não exige tipo access. | Separar explicitamente os propósitos e exigir tipo, emissor e audiência apropriados; testar que access não renova sessão e refresh não acessa recursos protegidos. |
| P1 | `/os/:id/agendar` usa OS_EXECUTAR e agendarVisita não chama validarConflito. Um técnico pode alterar a data da própria OS por esse caminho, apesar da restrição existente em /reagendar. | Definir política única de agendamento e aplicar permissões e verificação de conflito em todos os endpoints. Testar os caminhos alternativos. |
| P1 | validarConflito faz SELECT antes da escrita, sem proteção suficiente contra duas transações concorrentes para o mesmo técnico. criarRetorno valida a duração recebida, mas não persiste essa duração no INSERT. | Serializar alterações por técnico ou impor restrição de sobreposição no PostgreSQL; persistir a duração validada. Testar duas criações simultâneas em banco real. |
| P1 | migrate.js executa apenas migration.sql. A tabela lgpd_auditoria está no patch 002 e não aparece no schema principal, embora o controller a utilize. | Implementar executor de migrações versionadas e testar instalação vazia e atualização. Os endpoints devem funcionar após o comando documentado, sem SQL manual adicional. |
| P1 | LgpdController.exportarDados retorna até 500 clientes da empresa para qualquer usuário autenticado, sem condição de perfil, apesar do comentário indicar gestor. | Delimitar os dados da exportação e aplicar autorização para exportação empresarial. Testar usuário técnico sem permissão de clientes. Este é um achado técnico, sem avaliação jurídica de conformidade. |
| P1 | Fotos e PDFs são servidos em app.js sem autenticação, por chave. Fotos recebem cache público de um ano. A chave funciona como credencial compartilhável de longa duração. | Definir política de acesso e revogação: leitura autenticada no painel/app e links temporários para compartilhamento externo; revisar cache de evidências. |
| P2 | PDF/WhatsApp são processados após finalização sem fila persistente; _gerarEPersistirPdf registra falha e retorna null. Uma reinicialização pode interromper a entrega. | Registrar tarefa durável na transação da OS e processar com retry e idempotência; expor status de geração/envio e reprocessamento. |

## Documentação que precisa de revisão

- `08-melhorias-futuras.md`: B17 afirma ausência de cobertura, mas existem 36 testes; W2 já tem refresh com mutex; M1 tem contexto/paleta de tema, M2 tem serviço de lembretes e M4 tem prévia de foto. Classificar como implementado, parcial ou pendente após validação funcional, evitando repetir trabalho.
- `qa-qc-analise.md`: parte dos bugs listados já foi corrigida no código, como erro global, validação de ID e conflito no retorno. A correção da fila por descarte introduz risco de perda de dados. A descrição de 28 testes também está desatualizada.
- A afirmação de isolamento em 100% das queries não é comprovada pela suíte atual. A descrição de diretórios como web/src/contexts, hooks e routes e mobile/src/navigation não corresponde à estrutura encontrada.
- `04-fluxo-os.md`: o diagrama sugere PDF pronto na resposta de finalização; o código o gera posteriormente. Documentar estado pendente e consulta posterior.
- README e índice citam DEPLOY.md, APRESENTACAO.md e DEPLOY_AWS_EC2_UBUNTU.md, ausentes na árvore examinada.
- Registrar procedimento de backup/restauração, migrações, revogação de sessão, configuração de cookies/CORS e tratamento de pendências offline. Diferenciar recurso implementado de recurso validado.

## Ordem de execução sugerida

1. **Estabilizar o mobile:** corrigir dependência, preservar falhas offline, isolar dados por conta e validar instalação nova/atualização do SQLite. O CREATE inicial já inclui client_uuid e a migração v2 tenta adicioná-lo novamente; uma falha tolerada pode impedir a criação do índice subsequente. Tornar cada etapa verificável e transacional.
2. **Fechar acesso e sessão:** tipos de JWT, revogação, uso efetivo de cookie no web, exportação de dados e acesso a arquivos.
3. **Garantir integridade operacional:** unificar agendamento, proteger concorrência no PostgreSQL e executar todos os patches em instalações novas.
4. **Ampliar validação:** testes de integração com PostgreSQL real para isolamento entre empresas, concorrência de agenda/estoque, refresh/logout e migrações; testes de mobile para perda de rede, reinício e troca de conta; E2E web para login, criação e reagendamento.
5. **Evoluir produto:** alertas de contratos/estoque, relatórios por período e inadimplência, exportação CSV e lembretes de atendimento. Depois, avaliar SSE e automação do WhatsApp conforme uso real.
6. **Preparar crescimento:** fila persistente de integrações, métricas de falha/latência, teste de restauração, paginação e migração de binários para armazenamento de objetos conforme volume. S3 não corrige sozinho autorização de arquivos ou perda de tarefas.

Não priorizaria agora migrações gerais para TypeScript/Expo Router, personalização de dashboard ou novos módulos fiscais antes dos itens de confiabilidade e acesso. O sistema já cobre grande parte do fluxo de campo; o próximo ganho é tornar esse fluxo seguro e recuperável nas falhas.
