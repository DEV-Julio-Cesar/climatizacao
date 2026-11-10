# Pendências atuais — revisão de 29/10/2026

> Registro histórico. Consulte a [revisão de 09/11/2026](./17-revisao-documentacao-2026-11-09.md) para o estado atual. Achados e resultados abaixo pertencem à versão analisada na época.


> Implementação posterior: as correções de sessão, acesso, integridade, alertas, relatórios, recuperação e WhatsApp foram trabalhadas no [lote 13](./13-implementacao-pendencias.md). Consulte esse documento para o estado atual e os limites restantes.

Revisão estática do código e dos documentos após as correções e a validação rápida. Não foram repetidos builds ou testes nesta análise. Implementação local não comprova migração, implantação, funcionamento visual ou homologação em aparelho. O backlog 08 continua sendo histórico; este documento define a próxima sequência.

## Correções antes de novas funcionalidades

| Prioridade | Pendência confirmada no código | Evidência e conclusão esperada |
|---|---|---|
| P0 | Completar migração da sessão nas páginas web | App.jsx mantém usuário em memória e api.js limpa localStorage; Clientes.jsx, Catalogo.jsx e PainelDespacho/index.jsx ainda leem `climasaas_usuario` do localStorage para habilitar ações. Isso pode ocultar cadastro, edição e reagendamento mesmo para usuário autorizado. Criar contexto único de sessão/permissões, migrar os consumidores e validar as ações após login e recarga. |
| P1 | Logout mobile deve revogar antes de apagar credenciais em todos os caminhos | AgendaMapa.js apaga tokens antes de chamar onLogout; App.js tenta revogar a sessão somente depois. Por esse caminho, o refresh já não está disponível e a sessão pode permanecer válida no servidor. Centralizar logout, cancelamento de lembretes e limpeza local; testar cada botão de saída e indisponibilidade da rede. |
| P1 | Atualização imediata de perfil e permissões | GestaoController.salvarPermissoes altera o banco, mas authMiddleware continua usando perfil/permissões do JWT por até oito horas. Carregar autorizações atuais ou invalidar/versionar sessões ao mudar acesso. Testar remoção de uma permissão com token ainda válido. |
| P1 | Pagamentos concorrentes e repetidos | FinanceiroController.registrarPagamento consulta saldo e insere sem transação/lock e sem chave de idempotência. Dois pagamentos podem passar na checagem do mesmo saldo. Serializar por OS e deduplicar requisições; verificar também arredondamento e precisão monetária. |
| P1 | Baixa de estoque com peça repetida | OsModel salva linhas individuais sem agrupar produto. A baixa em OsController verifica cada linha contra o saldo inicial retornado pelo SELECT. Exemplo: saldo 5, duas linhas de 4 podem passar isoladamente e subtrair 8. Agrupar consumo por produto/origem e fazer decremento condicional atômico; testar saldo central e do técnico. |
| P1 | Aplicar conflito em visitas de contrato | GestaoController.gerarVisita insere OS às 09h, atribui ao usuário gestor que gerou a visita e usa somente o primeiro equipamento do contrato. Não chama validarConflito. Permitir técnico/horário explícitos, validar agenda e definir se contrato de vários aparelhos gera uma OS por aparelho ou uma visita com vários equipamentos. |
| P1 | Serializar edição de execução e finalização | OsExecucaoController consulta a OS sem FOR UPDATE e OsModel substitui os itens. A finalização possui lock, mas a edição concorrente não participa do mesmo protocolo. Bloquear a mesma OS antes de checar status/escrever relatório para impedir troca de itens durante a baixa/finalização. |
| P1 | Definir escopo de leitura de técnicos | `/os/todas` e `/os/finalizadas` exigem AGENDA_VISUALIZAR, disponível ao técnico; o model filtra por empresa, sem limitar ao responsável. O detalhe individual restringe ao técnico responsável. Uniformizar a política de leitura de listagem/detalhe e testar outro técnico da mesma empresa. |
| P1 | WhatsApp com roteamento por número da empresa | identificarEmpresa busca primeiro o cliente pelo telefone em todas as empresas e usa o primeiro resultado; depois recorre a WHATSAPP_EMPRESA_ID. O telefone do remetente não identifica de forma confiável a empresa destinatária quando um cliente atende com várias empresas. Mapear o número/phone_number_id recebido no webhook à empresa e às credenciais correspondentes. |

Esses são achados de código e riscos deduzidos dos fluxos; os cenários concorrentes ainda precisam de testes específicos. O texto anterior de que todas as gravações de agenda estão protegidas precisa ser limitado aos endpoints que realmente chamam validarConflito.

## Funcionalidades presentes, mas incompletas

| Recurso | O que já existe | O que falta |
|---|---|---|
| Offline | Fila preservada, separação por conta, reenvio manual e UUID em fotos | Idempotência das demais mutações, conflitos de edição, recuperação assistida dos registros `legado` e operação de suporte para itens bloqueados. Não reenviar automaticamente dados antigos sem identificar o dono. |
| PDF/WhatsApp | Worker persistente com retry e status na API | Painel de tarefas pendentes/falhas e reprocessamento autorizado; reduzir reenvios após falha entre aceite da Meta e confirmação local. |
| Tema mobile | Contexto, paleta e seletor; useTheme em Login e Perfil | Aplicar tema às demais telas e navegação. app.json ainda força `userInterfaceStyle: light`. Não considerar M1 concluído no app inteiro. |
| Lembretes | Serviço local e cancelamento | Garantir cancelamento na saída por Perfil e separar estado por conta. A sincronização recebe a agenda filtrada e cancela IDs ausentes; avaliar perda de lembretes ao mudar busca/filtro. |
| Contratos | Cadastro, consulta e geração manual de visita | Edição/encerramento conforme política, alertas independentes de acesso à tela e fluxo completo para múltiplos aparelhos. |
| Alertas | Notificações consultáveis e indicador de estoque baixo | Alertas de contratos são inseridos ao consultar GET /notificacoes; não há job independente de contratos/estoque com deduplicação e destinatários definidos. |
| Financeiro e relatórios | Pagamentos, saldos e indicadores | Período, técnico e serviço configuráveis; CSV/Excel; relatório acionável de inadimplência. O relatório gerencial usa 90 dias fixos. Registrar forma PIX não equivale a gerar cobrança ou conciliar pagamento. |
| WhatsApp | Conversas, atendente e triagem básica | Agendamento guiado, confirmação de horário, lembretes e atualização em tempo real. O painel usa polling de 5/8 segundos. |
| iOS/deep links | Bundle identifier, configuração inicial e scheme climasaas | Homologação dos recursos nativos, build/distribuição e tratamento dos links dentro da navegação. Scheme declarado não comprova navegação por link funcionando. |
| Validação rápida | Seleção por componente, cache e jobs paralelos no CI | Testes de interface e domínio para os casos desta revisão. Cache/build não comprova comportamento de botões, logout ou concorrência. |

## Recursos ainda não encontrados na implementação

- Recuperação de senha por token temporário; alteração de senha autenticada já existe.
- Exportação operacional CSV/Excel e relatórios com filtros completos.
- Geração/conciliação de cobrança PIX, webhooks de saída para ERP/CRM e emissão fiscal.
- SSE/WebSocket para atendimento e operação.
- Armazenamento de fotos/PDFs fora do PostgreSQL e política de retenção/expurgo.
- Paginação de `/os/todas` e listas de cadastros; finalizadas tem limite de 200, mas não navegação paginada.
- OpenAPI e testes de interface web/mobile. Os testes atuais de SQLite/fila não equivalem a testes das telas.
- Biometria, assinatura acompanhada do nome do signatário, leitura de código de barras de peças e galeria com zoom.
- Se o objetivo for comercializar como SaaS de autosserviço: onboarding de empresas, convites, planos, limites e cobrança da plataforma. Isso exige decisão de produto; não é necessário para uso interno de uma empresa.

## Documentação e operação pendentes

- Consolidar o backlog 08 com status por item. B2 já foi atendido por sessões PostgreSQL, sem exigir Redis; B17 tem cobertura parcial; B18 já possui alguns schemas inline no financeiro. W1/W2 têm implementação, mas a migração dos consumidores web está incompleta. M6 possui compartilhamento de PDF, e M15 já declara scheme.
- Remover ou corrigir afirmações absolutas em qa-qc, como isolamento em 100% das queries ou recursos validados apenas pela presença do código.
- Atualizar documentos 03, 05 e 06 para sessão atual, limitações de offline, status assíncrono de documentos e alcance real do tema.
- Comprovar execução das migrações, CI com PostgreSQL, homologação em aparelhos e sessão no domínio de produção. Não houve confirmação dessas etapas nesta revisão.
- Concluir auditoria de dependências, procedimento verificável de backup/restauração, testes de carga e alertas operacionais. Não avaliar essas etapas como concluídas apenas por haver workflow ou documentação.

## Próximas entregas sugeridas

1. **Sessão e acesso:** corrigir contexto web, centralizar logout mobile, atualizar permissões em sessões ativas e uniformizar escopo de leitura.
2. **Integridade operacional:** pagamentos transacionais/idempotentes, consumo agregado de peças, lock da execução e agendamento de contratos.
3. **Recuperação:** idempotência offline, recuperação do legado e gestão das tarefas de documentos.
4. **Valor para gestão:** alertas automáticos de estoque/contratos, filtros de relatório, CSV e inadimplência.
5. **Expansão:** WhatsApp por empresa, tempo real e agendamento guiado; depois armazenamento externo e módulos comerciais conforme demanda.
