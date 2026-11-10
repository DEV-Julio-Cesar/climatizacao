# Implementação das pendências — 29/10/2026

> Registro histórico. Consulte a [revisão de 09/11/2026](./17-revisao-documentacao-2026-11-09.md) para o estado atual. Achados e resultados abaixo pertencem à versão analisada na época.


Este documento atualiza o estado do backlog 12. As mudanças estão no código local; nenhuma migração ou configuração de produção foi aplicada durante esta entrega.

## Entregue

| Área | Comportamento implementado |
|---|---|
| Sessão web | Contexto único em memória para Clientes, Catálogo e Despacho. As telas não dependem mais de `climasaas_usuario` no localStorage. A sessão atual é consultada ao entrar e a cada 30 segundos. |
| Permissões | API consulta perfil e overrides atuais em cada requisição, verifica a empresa ativa e reaproveita essa verificação entre os routers da mesma requisição. Revogar acesso bloqueia a próxima chamada, sem esperar expirar o JWT. Mobile atualiza os dados de sessão ao conectar e a cada minuto enquanto online. |
| Logout mobile | Agenda delega a saída ao fluxo central, que revoga o refresh antes de apagar credenciais e cancela lembretes. Não encerra a sessão silenciosamente se o servidor estiver indisponível. |
| Escopo de ordens | Técnicos recebem apenas suas próprias ordens em `/os/todas` e `/os/finalizadas`; gestores/admin mantêm visão da empresa. |
| Login | Limite adicional por e-mail normalizado, além do limite por IP. O limite é mantido na memória de cada instância. |
| Pagamentos | Transação com lock da OS, saldo em centavos, rejeição de frações de centavo e deduplicação por `client_uuid`. Mobile mantém a chave ao repetir o mesmo envio após falha de rede. Sem chave, clientes antigos continuam funcionando, mas não têm proteção contra reenvio. |
| Estoque | Consumo agregado por produto; decremento atômico condicionado ao saldo suficiente no estoque central ou do técnico. Linhas duplicadas não conseguem consumir o saldo inicial várias vezes. |
| Execução | Edição de relatório adquire lock da OS antes de validar status e gravar itens, participando do mesmo protocolo da finalização. |
| Contratos | Mobile escolhe técnico, horário local e duração por aparelho. API valida técnico, cliente e competência, gera uma OS por aparelho em sequência e verifica conflitos. Toda a geração e avanço da próxima visita são atômicos. Contrato sem aparelho gera uma visita geral. |
| Reenvio offline | Mutações de OS aceitam `Idempotency-Key`. Resultado e alterações são persistidos na mesma transação; mesma chave/payload retorna resultado sem repetir escrita. Chave com payload diferente é rejeitada. A fila mobile reutiliza o identificador em criação, eventos, status, execução, retorno e agendamento. |
| Legado offline | Central mobile permite recuperação explícita por gestor/admin. A API verifica referências de OS/clientes contra a empresa atual antes da transferência local. Registros de outras empresas ou inválidos permanecem isolados. A recuperação não envia os itens automaticamente: revisar antes de sincronizar. |
| Lembretes | Mapa separado por conta; notificações antigas sem identificação são canceladas. Filtros/buscas da agenda não removem lembretes de ordens omitidas na tela, pois os lembretes são sincronizados a partir da agenda completa. |
| Alertas | Worker inicia com o servidor e roda a cada hora. Cria alertas de estoque mínimo e visitas preventivas próximas/atrasadas para gestores ativos, com chave diária de deduplicação e filtro de permissões. GET /notificacoes deixa de gerar alertas como efeito colateral. |
| Documentos | Central web exibe tarefas e oferece reprocessamento autorizado. Tarefas em processamento não podem ser reiniciadas. Retry reutiliza PDF/chave existentes para não invalidar links anteriores. Reprocessamento pode reenviar uma cópia ao cliente; a interface pede confirmação dessa ação específica. |
| Relatórios | Dashboard aceita início/fim, técnico e tipo de serviço. CSV UTF-8 com proteção contra fórmulas e limite de dez mil ordens. API oferece ordens finalizadas com saldo pendente; isso não comprova inadimplência, pois não há vencimento formal de cobrança no modelo. |
| WhatsApp | Empresa destinatária é resolvida pelo phone_number_id recebido no webhook; cliente é buscado somente nessa empresa. Saídas de atendimento, orçamento e PDF usam a conta da empresa. Configuração numérica/credenciais ainda deve ser feita pelo operador. |

## Migrações e configuração

1. Faça backup e homologue em um banco separado.
2. Execute `npm run migrate` antes de iniciar a API atualizada. Além dos patches anteriores, serão aplicados `005_pagamentos_idempotencia.sql`, `006_operacoes_e_alertas.sql` e `007_whatsapp_empresas.sql`.
3. Atualize API, painel e mobile juntos. A geração de visita por contrato agora exige `tecnico_id`, `agendado_para`, `duracao_prevista_minutos` e `competencia` (a data atual de próxima visita do contrato).
4. Para multiempresa WhatsApp, cadastre `empresas_whatsapp(empresa_id,phone_number_id,token_env)`. O token fica na variável de ambiente indicada por `token_env`, no formato `WHATSAPP_ACCESS_TOKEN_EMPRESA_2`, e não em texto no banco. Remova a associação legada da empresa ao migrá-la para uma conta por tabela. A associação legada explícita `WHATSAPP_EMPRESA_ID`/`WHATSAPP_PHONE_NUMBER_ID` permanece compatível.
5. `npm start` inicia os workers de documentos e alertas. Não é necessário abrir a tela de notificações para gerar alertas.

## Rotas novas e alteradas

- `GET /conta/sessao`: usuário e permissões atuais, sem cache.
- `POST /offline/verificar-legado`: valida referências para recuperação local; exige gestor/admin e gestão.
- `GET /documentos/tarefas`: últimas cem tarefas da empresa, exige gestão.
- `POST /documentos/:id/reprocessar`: exige gerenciamento; reagenda geração/envio.
- `GET /relatorios/gerencial?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&tecnico_id=7&tipo_servico=LIMPEZA`.
- `GET /relatorios/exportar`: mesmos filtros; resposta CSV.
- `GET /relatorios/recebimentos-pendentes`: mesmos filtros, exige acesso financeiro.
- `POST /os/:id/pagamentos`: `client_uuid` opcional; chave repetida com os mesmos dados retorna o lançamento existente.
- Mutações de OS: cabeçalho `Idempotency-Key` opcional para clientes compatíveis.

Ordens no relatório são selecionadas por criação; recebido é calculado pela data de pagamento e pelos filtros de técnico/serviço. O resumo de contratos ativos é a posição atual, independentemente do período.

## Validação e pendências restantes

Validação local do lote: 59 testes passaram e um teste PostgreSQL ficou ignorado por falta de `TEST_DATABASE_URL`. Build do painel e exportação web do mobile passaram. Isso não substitui homologação visual ou em aparelho.

Testes cobrem permissões atuais, escopo de técnico, limite por conta com IPs diferentes, pagamentos repetidos/excesso/fração de centavo, produtos repetidos em ambos os estoques, operação offline repetida, competência/horários de contrato, alertas e roteamento de WhatsApp. SQLite real em memória verifica isolamento e transferência explícita de legado. O teste opcional PostgreSQL também verifica pagamentos concorrentes; depende de `TEST_DATABASE_URL` e está configurado no CI. Sem essa variável, ele permanece ignorado localmente.

Ainda precisam de implementação: recuperação de senha com canal de entrega, SSE/tempo real, agendamento guiado do bot, tema completo do mobile, nome do signatário, biometria, galeria com zoom, paginação das listas, armazenamento externo/retencão de binários, integrações de cobrança/fiscal/ERP e testes E2E. Planos/cobrança da plataforma dependem da decisão de comercialização como SaaS de autosserviço.

Ainda precisam de homologação: migrations/PostgreSQL real, domínio/cookies em produção, dispositivo Android/iOS, credenciais/números Meta e execução contínua dos workers. Entrega WhatsApp pode se repetir após falha entre aceite remoto e confirmação local. As operações idempotentes não possuem expurgo automático; definir retenção compatível com o tempo máximo de reenvio offline antes de remover registros.
