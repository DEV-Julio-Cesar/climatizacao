# Revisão de segurança e proteção de dados — 08/11/2026

## Escopo e método

Revisão estática do backend Express/PostgreSQL, web React e mobile Expo, incluindo o novo perfil de empresa. Três verificações locais com mocks confirmaram comportamentos vulneráveis sem acessar banco real ou documentos de usuários. Nenhum código funcional ou dado de produção foi alterado nesta revisão. O script temporário de reprodução foi removido.

Não constitui pentest de produção ou parecer jurídico. Não foram avaliados infraestrutura implantada, IAM, backups reais, certificados, histórico Git completo, dependências por base de CVEs, contratos ou processos internos. Ausência de evidência no repositório não prova ausência de um controle na operação.

## Achados prioritários

### S01 — ALTA: exportação LGPD permite extração de dados de terceiros

Evidência: src/app.js:145 e src/controllers/LgpdController.js:44–61. A rota exige somente autenticação. A consulta de clientes filtra exclusivamente empresa_id, sem verificar perfil ou permissões, e retorna nome, telefone, endereço e CPF/CNPJ decifrado. Até um técnico sem permissões recebe clientes da empresa. Confirmado com mock do banco. Não se demonstrou acesso a outra empresa por esse endpoint.

Impacto: extração em massa, desvio do propósito de acesso do titular e burla de permissões revogadas. LIMIT 500 não corrige o acesso indevido; LIMIT 500/1000 também contradiz a promessa de exportação completa.

Correção: exportação do titular deve abranger os dados referentes à própria pessoa, com avaliação de informações de terceiros. Exportação empresarial deve ser uma operação distinta, com autorização específica, auditoria e minimização. Criar regressões para técnico sem permissões e isolamento por tenant.

### S02 — ALTA: cache e fila mobile não são isolados por conta/empresa

Evidência: mobile/src/database/sqlite.js:6,13,22,74,99; mobile/src/screens/Agenda/AgendaMapa.js:28,32; mobile/src/services/SyncService.js:27; mobile/src/screens/Perfil/PerfilScreen.js:71; mobile/App.js:105.

Um único arquivo SQLite contém cache e fila, sem empresa_id/usuario_id. A agenda usa chaves baseadas apenas em filtro e busca. O logout apaga credenciais, mas não limpa ou separa cache/fila. A sincronização despacha a fila inteira com a credencial atual.

Cenário: A usa o aparelho, deixa cache/operações pendentes e sai; B entra, uma falha de rede recupera a agenda de A e a sincronização tenta despachar operações de A como B. O servidor pode bloquear IDs incompatíveis, mas isso não protege o cache nem todas as operações novas. Inferência baseada no fluxo; não foi executada troca real de contas em aparelho.

Correção: identificar empresa e usuário em toda entrada local; consultar/processar apenas o escopo autenticado, inclusive durante troca de sessão; encerrar sincronização em andamento na troca. Manter fila pendente inacessível à outra conta e avisar seu proprietário, em vez de simplesmente apagar trabalho. Definir expiração, criptografia compatível com a plataforma e limpeza segura de anexos.

### S03 — ALTA: gestor consegue conceder permissão curinga

Evidência: src/routes/gestao.routes.js:22; src/controllers/GestaoController.js:56; src/middlewares/permissaoMiddleware.js.

GESTOR com GESTAO_GERENCIAR pode editar as próprias permissões. O corpo aceita qualquer string, inclusive '*', que é gravada como override permitido. O middleware interpreta '*' como autorização universal. Confirmada a gravação em si próprio com mock. Isso burla controles granulares, mas não altera o perfil no banco: rotas que também exigem perfil ADMIN, como editar empresa, continuam bloqueadas.

Correção: restringir administração de permissões a ADMIN, catálogo explícito de permissões delegáveis, proibir '*' em overrides e alterações privilegiadas por gestor; auditar alterações e limpar overrides já indevidos.

### S04 — ALTA CONDICIONAL: webhook aceita mensagens sem autenticidade

Evidência: src/controllers/WhatsAppController.js:64–71. A assinatura só é validada se WHATSAPP_APP_SECRET e rawBody estiverem presentes. Sem segredo, o webhook retorna 200 e prossegue. Confirmada a aceitação com mock. Não foi inspecionado o valor do segredo do ambiente nem afirmado que falta em produção.

Impacto: se essa condição ocorrer no deploy, conteúdo e remetentes podem ser forjados e acionar persistência/automação.

Correção: recusar requisições quando faltar segredo, corpo bruto ou assinatura válida; validar configuração no início do servidor e testar ausência/assinatura adulterada.

### S05 — ALTA: WhatsApp escolhe empresa pelo telefone do cliente

Evidência: src/controllers/WhatsAppController.js:9–18,80. Busca clientes globalmente pelo telefone e escolhe o primeiro com ORDER BY c.id LIMIT 1. Não usa o identificador do número receptor para determinar o tenant.

Cenário: a mesma pessoa é cliente de duas empresas. A mensagem pode ser atribuída à empresa do cadastro mais antigo. É falha de roteamento com potencial de exposição entre empresas, mesmo com webhook assinado. Não foi reproduzida com tráfego externo.

Correção: mapear metadata.phone_number_id/WABA para tenant previamente configurado; buscar o cliente somente dentro desse tenant; rejeitar combinações não configuradas. Para uma central compartilhada, exigir seleção de contexto confiável, sem adivinhação por telefone.

### S06 — ALTA: exclusão LGPD inconsistente e promessa de anonimização excessiva

Evidência: src/controllers/LgpdController.js:96–107; src/database/migration.sql:27–44,352; src/services/PushService.js:7.

A exclusão atualiza usuarios.push_token e usuarios.updated_at, mas essas colunas não aparecem na definição/migrações de usuarios do repositório. Em instalação criada por essas migrações, a query falha e a transação reverte. Confirmado por comparação estática de schema; banco implantado não foi consultado.

Dispositivos reais estão em dispositivos_push, e o fluxo não os desativa. Sessões, notificações, filas de recuperação/e-mail, arquivos, snapshots de OS e outros registros precisam de inventário de retenção. O e-mail usuario_<id>_removido é previsível e o registro continua ligado ao histórico: não basta para afirmar anonimização irreversível. Integridade referencial, isoladamente, não é justificativa legal de retenção.

Correção: alinhar SQL ao schema e testar em PostgreSQL real de teste; revogar sessões e dispositivos; definir tratamento por categoria e prazo, incluindo backups. Distinguir exclusão, restrição, retenção justificada e pseudonimização. Exigir reautenticação para exclusão e tratar o último administrador para não deixar empresa sem responsável.

### S07 — MÉDIA/ALTA conforme exposição: PDFs acessíveis por URL permanente

Evidência: src/app.js:89–103; src/controllers/OsController.js:429–445; src/services/PdfService.js.

A rota de PDF não exige autenticação, assinatura ou expiração. A chave aleatória dificulta adivinhação, mas quem possui o link consegue baixar o documento com nome, endereço, assinatura e informações de atendimento. O link é enviado por WhatsApp. Não equivale a dizer que os arquivos são enumeráveis.

Correção: acesso autenticado ou links assinados de duração definida com revogação; avaliar página autenticada/OTP para compartilhamento com cliente. Reduzir dados no PDF e controlar cache. Inspecionar também /uploads: diretório estático público existe, mas não foi constatado conteúdo sensível ali.

### S08 — MÉDIA: encerramento de sessão mobile somente local

Evidência: mobile/src/screens/Perfil/PerfilScreen.js:71–79 e mobile/App.js:105–111. Logout remove tokens locais sem pedir revogação ao backend. A sessão e credenciais eventualmente copiadas continuam válidas segundo os prazos do servidor. Push também permanece associado até outra atualização.

Correção: logout centralizado que revogue sessão e desative vínculo do dispositivo; política explícita de logout offline e limpeza de notificações locais. Remoção local sozinha não revoga um token roubado.

### S09 — MÉDIA: minimização e gestão criptográfica incompletas

Evidência: src/controllers/CadastroController.js:281–294 retorna SELECT * de clientes, incluindo material de documento cifrado/hash; src/services/DocumentoService.js:4 usa fallback para JWT_SECRET; src/services/ArquivoUrlService.js:4 faz o mesmo para links. O web guarda access token em localStorage, acessível a JavaScript (web/src/services/api.js:41). Isso amplia impacto de uma eventual XSS; não foi demonstrada XSS nesta revisão.

Correção: DTOs explícitos e documentos mascarados conforme finalidade/perfil; não devolver material criptográfico; segredos independentes obrigatórios em produção, identificador de chave e plano de rotação. Rotacionar JWT_SECRET quando também é chave de dados pode inviabilizar leitura de documentos antigos. Avaliar BFF/cookies HttpOnly ou token curto em memória para web, com controles CSRF adequados ao desenho escolhido.

## Avaliação das alterações de perfil/CPF/CNPJ

A edição da empresa exige ADMIN e utiliza empresa_id da sessão. Schemas estritos recusam campos extras de tenant. A consulta não envia CPF para terceiros; CPF passa somente por validação matemática, e CNPJ vai para BrasilAPI. Timeout e limite de chamadas estão presentes.

Pontos a melhorar: auditoria das mudanças de razão social/CNPJ; reautenticação para alterações de identidade relevantes; unicidade por CNPJ normalizado (a coluna UNIQUE de texto permite diferença entre legado formatado e valor novo normalizado); política de confiança dos dados consultados. Um CNPJ encontrado na base não comprova que o administrador representa a empresa. O novo fluxo não é um mecanismo de identificação civil nem substitui verificação de representação.

## LGPD: lacunas de governança a validar

A política src/web/privacidade.html descreve categorias/finalidades gerais, mas não detalha bases legais por finalidade, identificação adequada dos agentes e papéis, critérios concretos de retenção ou o novo uso da BrasilAPI. A frase 'dados pertencem à empresa' deve ser revista para não obscurecer direitos dos titulares. Não se deve presumir consentimento como base para todo o sistema.

Documentar:

- Inventário das operações (art. 37), categorias de titulares, finalidades, necessidade e bases legais (arts. 6, 7 e, se aplicável, 11).
- Papel do SaaS e de cada empresa: controlador/operador conforme a operação, contratos e instruções; lista de suboperadores e transferências internacionais quando aplicáveis.
- Retenção e descarte por categoria, evidências de obrigações legais, backups e atendimento verificável aos direitos (arts. 15,16,18,19).
- Fotos, assinatura e geolocalização com acesso mínimo e finalidade clara. Uma imagem de assinatura não deve ser automaticamente classificada como biometria sensível; avaliar se há tratamento biométrico vinculado à pessoa.
- Plano de incidentes, responsável, classificação de risco, registro e capacidade de comunicação. A regra geral da Resolução 15/2024 é três dias úteis para incidentes comunicáveis, observadas exceções e regras aplicáveis a agentes de pequeno porte.
- Segurança de backups, restauração, privilégio mínimo no banco/S3, TLS e validação de certificados, retenção dos logs e gestão de segredos. Essas condições exigem evidência da infraestrutura.

## Ordem recomendada

P0: bloquear exportação excessiva e delegação '*'; isolar armazenamento/sincronização mobile; fechar webhook sem configuração e corrigir tenant do WhatsApp.

P1: corrigir/testar exclusão LGPD, revogação/logout/push e compartilhamento de PDFs; revisar DTOs e permissões de clientes.

P2: política de retenção, direitos completos, auditoria de alterações, chaves/rotação, hardening de infraestrutura e dependências.

Critérios de aceite: testes negativos por perfil e tenant; troca de conta com cache/fila pendentes; assinatura ausente/incorreta; mesmo telefone em duas empresas; exclusão em schema real e verificação de dispositivos/sessões; revogação/expiração de links. Testes funcionais existentes aprovados não cobrem automaticamente esses cenários.

## Controles positivos observados

bcrypt, JWT com algoritmo fixo, checagem de sessão revogada e empresa ativa por requisição, recálculo de permissões no backend, refresh token web HttpOnly com rotação, consultas parametrizadas em fluxos revisados, documentos com AES-GCM e hash por tenant, limites de autenticação, validação de uploads e URLs temporárias para fotos. Esses controles não neutralizam os achados acima.

## Referências oficiais

LGPD, texto atualizado: https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html

ANPD, comunicação de incidente: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis

ANPD, regulamento de comunicação: https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca

## Atualizacao posterior: correcoes

As correcoes tecnicas, evidencias de teste, requisitos de deploy e pendencias organizacionais estao documentadas em [correcoes-seguranca.md](correcoes-seguranca.md). As observacoes acima registram o estado anterior a essas correcoes; nao significam que houve exploracao.
