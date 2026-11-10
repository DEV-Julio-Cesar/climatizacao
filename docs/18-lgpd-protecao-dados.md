# LGPD e proteção de dados — implementação de 09/11/2026

Este documento separa controles implementados de decisões organizacionais ainda necessárias. Não é um certificado de adequação à LGPD. A identificação jurídica, bases legais, períodos de retenção, fornecedores contratados e responsabilidades devem ser aprovados pelo responsável pela operação com apoio jurídico.

Entrega posterior: [homologação PostgreSQL e proteção offline](./19-homologacao-protecao-offline.md). Os limites/testes descritos abaixo registram o estado da entrega inicial; a nova entrega protege conteúdos locais, mas não implanta SQLCipher, MDM ou purga completa.

Complemento: [lote 20](./20-privacidade-web-mobile.md) adiciona telas nativas de solicitações no mobile, filtros/histórico e reenvios protegidos na API. A indicação abaixo de uso exclusivo do navegador para privacidade mobile pertence à entrega inicial.

## O que mudou no sistema

- `GET /conta/dados?cursor=0&limite=50`: resumo pessoal, com limite de 1 a 100 e cursor por ID de OS; `tem_mais`/`proximo_cursor` permitem continuar. Não exporta o cadastro de clientes nem seus nomes/endereços para gestores ou técnicos. Não representa cópia integral de todos os dados: fotos, PDFs, textos livres e registros de outras categorias exigem atendimento de uma solicitação de acesso. Dados operacionais vinculados, inclusive de OS excluídas logicamente, podem constar do resumo.
- `DELETE /conta/dados`: exige `{ "confirmacao": "CONFIRMAR_EXCLUSAO", "senha_atual": "..." }`. Bloqueia a linha do usuário como o login/recuperação, confere senha, substitui nome/e-mail de acesso por identificador aleatório, desativa a conta, revoga sessões, remove dispositivos push, invalida recuperações e apaga conteúdo cifrado dos e-mails pendentes. Auditoria e alterações são transacionais; falha de auditoria impede sucesso. Limite de cinco chamadas por conta/15 minutos por instância.
- Desativar não é anonimizar: identificadores internos e relacionamentos permanecem. Fotos, PDFs, assinaturas, textos livres, logs, solicitações, cópias locais e backups não são apagados pelo endpoint. Links de arquivo anteriormente emitidos podem continuar utilizáveis até expirar; eles não dependem da sessão do usuário. Não há garantia de recolhimento de arquivos já compartilhados.
- A exclusão anterior usava `push_token`/`updated_at` em `usuarios`, ausentes do schema; agora utiliza as tabelas existentes. Não há alegação automática de conservação por obrigação legal para todo registro.
- API de protocolos: criação autenticada para si; gestores/admin com `GESTAO_GERENCIAR` podem analisar pedidos da empresa. Pedidos vinculados a cliente exigem também `CLIENTES_GERENCIAR` para registrar, ler e atualizar. Empresa vem da sessão, nunca do corpo. Registro de cliente de outra empresa é rejeitado.
- Fluxo `RECEBIDA → EM_ANALISE → CONCLUIDA`, com resposta obrigatória e histórico de autor/status/data/resposta. Conclusão não executa exclusão automática nem comprova identidade verificada. Solicitações concluídas não são editadas; revisão usa novo protocolo.
- Listagem em páginas de 50, sem cache, e até dez novos protocolos por conta/hora, com contagem persistente e lock entre instâncias. Não há envio automático de e-mail ou consulta pública por protocolo.
- Painel: `Minha conta → Privacidade` permite resumo por páginas, registro/acompanhamento, análise autorizada e desativação com senha/confirmação. A API continua sendo a barreira de autorização.
- `/privacidade` foi atualizado para refletir recursos e limites reais. `PRIVACY_CONTROLLER_NAME` e `PRIVACY_CONTACT_EMAIL` configuram identificação e canal; sem eles o aviso orienta consultar o contrato/empresa. Isso não substitui preencher dados jurídicos e disponibilizar canal monitorado antes do uso comercial.

## Implantação

1. Revise e preencha as decisões abaixo; configure razão social/CNPJ e contato real nas variáveis acima. Não versione `.env` nem credenciais em documentos.
2. Faça backup e teste a atualização em ambiente separado. Execute `npm run migrate`: aplica `011_solicitacoes_privacidade.sql`, criando solicitações/histórico e índices. Não foi executada migração no banco operacional nesta entrega.
3. Publique API e painel compilado. Clientes antigos do endpoint de exclusão devem enviar a senha atual; sem ela recebem 400. O mobile mantém suas telas atuais e pode usar o painel no navegador para solicitações; não foi adicionado formulário nativo de privacidade nesta entrega.
4. Defina quem monitora protocolos e canais externos diariamente. Cliente sem conta solicita por canal contratual; funcionário autorizado verifica a identidade por meio proporcional, registra com `cliente_id`, informa o protocolo e transmite a resposta por canal verificado. Não exigir criação de conta ou anexar cópia de documento por padrão.
5. Homologue exportação, desativação, permissões, cópia offline, cookies e restauração. Testes com mocks não substituem PostgreSQL/dispositivo/domínio reais.

## Matriz inicial de tratamento e retenção

Bases abaixo são hipóteses para avaliação, não fundamentos aprovados. Consentimento não deve ser aplicado indiscriminadamente nem confundido com permissão da câmera/GPS. Cada empresa deve definir início da contagem, duração, exceções de preservação, responsável e método de eliminação. Nenhum prazo genérico foi imposto pelo software.

| Categoria e localização | Finalidade e acesso | Fundamento a avaliar pelo controlador | Retenção/eliminação a definir |
|---|---|---|---|
| Usuários, permissões e sessões: `usuarios`, `usuario_permissoes`, `sessoes` | Acesso da equipe, autorização e segurança; conta, gestão autorizada e infraestrutura | Relação contratual, contexto trabalhista e segurança, conforme caso | Encerramento do acesso revoga sessão; definir expurgo de sessões/hashes, permissões e metadados residuais |
| Clientes/endereço/CPF: `clientes`, `aparelhos` | Atendimento, contato e identificação de equipamento; equipe autorizada | Execução de contrato e obrigações específicas quando aplicáveis; justificar necessidade de CPF | Definir prazo após relação/último atendimento; soft delete não elimina CPF/endereço |
| GPS/data: clientes, OS, fotos, SQLite | Rotas e comprovação do atendimento; equipe autorizada | Necessidade/proporcionalidade por evento, informação a técnicos e clientes | Diferenciar coordenada de endereço e GPS do técnico; reduzir precisão/retenção quando possível |
| Fotos, assinaturas, relatórios/PDF: `os_fotos`, `ordens_servico` | Evidência, execução, garantia e comunicação; técnico responsável/gestão e destinatário do link | Execução contratual e exercício de direitos conforme caso; avaliar dado sensível caso conteúdo ou uso biométrico o configure | Definir prazo, acesso e descarte de binários/cópias; imagem de assinatura não significa anonimização nem validação biométrica |
| Pagamentos, orçamentos, compras/contratos | Gestão comercial e comprovação financeira; perfis autorizados | Contrato e obrigações fiscais/contábeis efetivamente aplicáveis | Assessoria deve identificar documento, norma e prazo; não presumir prazo único para toda OS |
| Conversas/mensagens WhatsApp, triagem e `whatsapp_respostas_bot` | Atendimento e envio de relatórios; equipe de atendimento autorizada e Meta | Finalidade e base por comunicação; informar compartilhamento | Política para histórico, resumo da triagem, fila de respostas e cópias nos aparelhos/Meta; apagar no banco não recolhe documento enviado. Sem expurgo automático da nova fila |
| Push/dispositivo: `dispositivos_push` | Notificar atendimento; infraestrutura e provedor Expo | Necessidade para recurso e escolhas do usuário | Remove registro push na desativação; definir limpeza de tokens inválidos/inativos |
| Recuperação: `recuperacoes_senha`, `emails_recuperacao` | Recuperar acesso; segurança e SMTP | Segurança do acesso e necessidade do serviço | Token vence em 15 min; conteúdo cifrado apagado ao consumir/desativar ou pela limpeza do worker. Metadados não têm expurgo geral |
| Protocolos/auditoria: `privacidade_solicitacoes`, `privacidade_historico`, `lgpd_auditoria` | Responder direitos e comprovar atendimento; titular/gestão autorizada | Obrigação aplicável e exercício de direitos, após avaliação | Definir período proporcional e acesso restrito; descrições podem conter dados pessoais. IP de auditoria também é dado a avaliar |
| Logs/backup e `operacoes_idempotentes` | Diagnóstico, recuperação e evitar reenvio duplicado; operação restrita | Segurança e continuidade, com minimização | Definir rotação de logs, ciclo de backup e prazo de reenvio; não expurgar idempotência antes do maior prazo offline suportado |
| SQLite/fotos no aparelho | Trabalho offline; usuário do aparelho e conta isolada no aplicativo | Mesmas finalidades do atendimento; informar armazenamento local | Logout/desativação não apagam automaticamente evidências locais; inventariar aparelhos, pendências e legado antes de descarte seguro |

## Fornecedores e transferência internacional

Inventariar os fornecedores realmente usados, contrato, finalidade, categorias recebidas, região, subprocessadores, acesso de suporte, transferência internacional aplicável e garantias adotadas. O repositório contém configuração Render/AWS, PostgreSQL externo, Meta/WhatsApp, Expo, SMTP, mapas e ViaCEP; isso não comprova quais estão contratados ou o local efetivo de processamento. Não declarar que todos os dados ficam no Brasil sem verificação.

## Decisões que precisam de preenchimento

| Decisão | Situação inicial | Evidência necessária |
|---|---|---|
| Razão social/CNPJ e canal de privacidade da plataforma | Razão social, CNPJ e e-mail informados pelo responsável e configurados no `.env` local | Testar recebimento/resposta e configurar também no ambiente de publicação; dados fornecidos não foram verificados em cadastro externo |
| Controlador/operador por finalidade e empresa contratante | Hipótese: empresa decide atendimentos; plataforma processa sob instrução; pode decidir finalidades próprias de conta/segurança | Contrato aprovado refletindo operação real |
| Bases legais e necessidade dos campos | Pendente | Registro por finalidade e avaliação jurídica |
| Prazos e exceções de retenção | Pendente | Matriz aprovada com norma/finalidade, gatilho, responsável e descarte |
| Responsável por direitos e incidentes | Pendente | Nome/cargo, substituto e canal monitorado; avaliar obrigação ou dispensa de encarregado conforme enquadramento |
| Regiões/contratos/transferências dos fornecedores | Pendente | Inventário e instrumentos contratuais |
| Teste PostgreSQL, restauração, dispositivo e operação | Não presumir homologação pela existência do código | Relatórios de teste com data, resultado e limitações |

## Roteiro de segurança e operação

- Testar usuário de A tentando listar/alterar protocolo, OS, foto e cliente de B; testar técnico tentando ler solicitação de outro usuário da mesma empresa e gestor sem permissão de clientes.
- Revisar MFA das contas de infraestrutura, menor privilégio no banco/cloud, TLS efetivo, acesso a backups e rotação de segredos. Mascaramento de campos não cobre automaticamente dados pessoais dentro de texto livre, exceções e URLs; revisar amostras sem copiá-las para o repositório.
- Para dispositivo perdido: revogar sessões, desativar token push, acionar responsável, avaliar dados offline presentes, bloqueio/apagamento remoto quando disponível e registrar o incidente. Revogação de servidor não apaga SQLite. Isolamento por conta não equivale a banco local cifrado; não há implantação de SQLCipher/MDM nesta entrega.
- Backups: documentar frequência, criptografia/acesso, prazo e teste de restauração em ambiente isolado. Manter lista restrita de eliminações executadas para reaplicar após restauração; não ressuscitar contas/dados apagados. Sanitizar ambiente de testes e nunca usar banco real para testes destrutivos.
- Requests de correção/eliminação devem verificar fotos/PDFs com dados antigos, réplicas offline, documentos compartilhados e preservação justificada. Nenhum job de purga automática foi criado enquanto os critérios de retenção não estiverem definidos.

## Atendimento aos titulares

Receber pedido, registrar data/canal, confirmar identidade de forma proporcional sem pedir documentos desnecessários, delimitar pessoa/dados/empresa e analisar a base do tratamento. Registrar resposta e providências concretas, inclusive fundamento de conservação ou negativa e possibilidade de revisão. Não colocar segredos, documentos ou dados de terceiros no campo de resposta, que fica visível ao solicitante autenticado. Pedidos de cliente registrados por funcionário são respondidos também pelo canal externo verificado.

O protocolo mede andamento; status `CONCLUIDA` não comprova que todos os sistemas/fornecedores foram alterados. Vincular evidências restritas fora dos campos públicos do pedido e manter responsabilidade pelo cumprimento dos prazos aplicáveis. O processo deve contemplar também portabilidade/revogação de consentimento e demais direitos quando aplicáveis, mesmo que registrados no tipo `INFORMACAO`.

## Resposta a incidentes

1. Registrar identificador, quem detectou, data/hora da detecção e do conhecimento do controlador, sistemas/empresas afetadas e evidências em repositório restrito. Incidente pode envolver vazamento, alteração, perda ou indisponibilidade de dados.
2. Conter: revogar acessos, isolar sistemas/aparelhos e preservar evidências. Rotacionar segredos afetados; não apagar logs necessários à investigação. Acionar o controlador sem demora injustificada quando atuar como operador.
3. Avaliar categorias, titulares/volume, sensibilidade, possibilidade de identificação, duração, medidas existentes e consequências. Documentar quem decidiu sobre necessidade de comunicação e a justificativa, inclusive quando não comunicar.
4. Quando houver risco ou dano relevante, o controlador deve avaliar comunicação à ANPD e aos titulares. A regra geral é de três dias úteis, contados conforme o regulamento; verificar exceções, legislação específica e eventual prazo diferenciado de pequeno porte elegível, sem presumir dispensa por tamanho. Não aguardar investigação completa para avaliar o prazo.
5. Comunicação: responsável autorizado usa canal oficial ANPD e meio acessível aos titulares; informa dados exigidos, medidas e orientações. Acompanhar complementações e manter prova das comunicações. Não enviar automaticamente e-mail em massa a partir do aplicativo.
6. Recuperar, verificar integridade, monitorar recorrência e documentar causa/plano de correção. Manter registro dos incidentes, inclusive não comunicados, por pelo menos cinco anos segundo o regulamento, com acesso restrito e observando obrigações adicionais.

## Minuta de cláusulas para revisão contratual

Esta lista é uma pauta de contrato, não contrato aprovado: identificar partes e papéis por finalidade; instruções documentadas; categorias de titulares/dados; bases e responsabilidades do controlador; confidencialidade e menor privilégio; subprocessadores e transferências; medidas técnicas efetivamente oferecidas; prazos de aviso de incidentes que permitam cumprir os legais; colaboração no atendimento de direitos; evidências de segurança; devolução/eliminação no término, backups e retenções justificadas; destino de dados offline e documentos enviados; canal e responsáveis; procedimento de atualização dos fornecedores.

## Validação desta entrega

`npm test`: 106 testes passaram, zero falhas e um teste PostgreSQL ignorado por ausência de `TEST_DATABASE_URL`. A suíte inclui 13 novos testes de domínio de privacidade e três testes HTTP, além da adaptação do teste de exportação existente. Cobertura exercita paginação explícita, ausência de cadastro empresarial no resumo, senha incorreta/ausente, limpeza de credenciais, falha de auditoria, autorização, protocolos/histórico, transições, limites e escape de HTML no aviso público.

O teste opcional PostgreSQL foi ampliado para verificar aplicação/reaplicação do patch, isolamento de protocolos entre empresas, resumo, rollback da desativação em falha de auditoria e limpeza real de sessões/push. Não foi executado localmente. Build de produção do painel aprovado; a primeira tentativa recebeu `EPERM` do sandbox, e a execução autorizada fora dele passou. Sintaxe dos controllers/API e `git diff --check` passaram. Não houve homologação visual, teste em aparelho, teste de restauração, envio externo ou implantação em produção.

## Fontes oficiais

- [LGPD, texto atualizado — Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html): princípios, bases, direitos, conservação e registros de tratamento.
- [Guia ANPD e modelo de registro de operações](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte): apoio ao inventário e às medidas de segurança.
- [ANPD — comunicação de incidente](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis) e [Regulamento nº 15/2024](https://bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html): avaliar critérios, contagem, comunicação e registro de incidentes.
- [Resolução ANPD nº 2/2022](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022): enquadramento e obrigações de agentes de pequeno porte.
