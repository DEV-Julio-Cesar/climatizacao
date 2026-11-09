# Correções de segurança e LGPD

Implementadas em 08/11/2026. Esta versão exige preparação do ambiente antes do deploy; não aplica alterações ao banco de produção automaticamente.

## Alterações

- Exportação pessoal remove consultas a clientes e campos livres de terceiros. Retorna dados cadastrais e metadados das atividades do usuário, sem prometer exportação integral de todos os sistemas.
- Apenas ADMIN pode conceder permissões do catálogo; curinga em overrides é rejeitado pelo backend e por constraint. Grants antigos de curinga são removidos na migração e ignorados na autenticação, inclusive antes dela.
- Webhook falha fechado sem segredo/assinatura e usa número receptor explicitamente vinculado à empresa. Status de mensagens e clientes são consultados no mesmo tenant. Envio também seleciona o número da empresa, sem reutilizar implicitamente o remetente de outro tenant.
- Mobile mantém bancos separados por empresa e usuário, com cache e payloads AES-GCM, chave por conta no SecureStore e cache válido por até sete dias. Fila só é despachada na conta original; respostas e retries verificam troca de sessão. A fila pendente permanece acessível somente à conta proprietária.
- O banco offline antigo, sem proprietário identificável, não é aberto pela nova versão. Ele não é apagado automaticamente para evitar perda de trabalho. A recuperação ou descarte deve ser feito em manutenção supervisionada no dispositivo e com confirmação do proprietário. Não atribua todo o legado à próxima conta que entrar.
- Logout mobile exige confirmação da revogação no servidor antes de remover credenciais; sem conexão, informa falha e permite tentar novamente. Tokens push são desativados no logout. A revogação desativa todos os vínculos push do usuário para evitar entrega residual; outros dispositivos registram novamente ao entrar.
- Exclusão exige senha atual, serializa remoção por empresa, protege o último ADMIN, usa somente colunas existentes, revoga sessões e remove dispositivos, notificações pessoais, permissões e fila de recuperação. A resposta descreve a retenção de registros operacionais vinculados, sem afirmar anonimização completa.
- PDF exige link assinado válido por 15 minutos, com assinatura separada da de fotos, sem cache e com verificação de empresa ativa. Links permanentes antigos deixam de funcionar. Respostas autenticadas com pdf_url recebem links renovados. PDFs em caminhos legados não suportados não são expostos; regenere o PDF no fluxo de OS quando necessário. A assinatura de URL não impede cópias já baixadas ou retenção de mídia pela Meta após envio.
- ADMIN pode revogar compartilhamento: DELETE /conta/arquivos/ordens/:id/compartilhamento. Nova geração do PDF usa outra chave e reabilita o compartilhamento. /uploads legado não é mais servido publicamente.
- Respostas JSON não usam cache. Lista de clientes não entrega CPF/CNPJ; detalhe autorizado remove documento_cifrado/documento_hash e apresenta o documento necessário à gestão cadastral. A atribuição de CLIENTES_VISUALIZAR deve ser revista por empresa conforme a finalidade do técnico.
- Tokens de acesso web ficam em memória; recarga restaura sessão pelo refresh HttpOnly. JWT não é mais persistido no localStorage. O cookie continua SameSite=Strict; API ainda exige Bearer para rotas de dados.
- Alteração de empresa exige senha atual e grava evento de auditoria. CNPJ tem unicidade normalizada no banco, inclusive com legado formatado.

## Preparação do deploy

1. Faça backup e ensaie a restauração em ambiente isolado. Verifique duplicatas de CNPJ normalizado antes da migração; a constraint falhará com duplicatas e a transação será revertida. Não exclua/mescle empresas automaticamente.
2. Configure JWT_SECRET, DATA_ENCRYPTION_SECRET, FILE_URL_SECRET e EMAIL_QUEUE_SECRET distintos, com pelo menos 32 bytes cada. Produção recusa inicialização insegura e DB_SSL_REJECT_UNAUTHORIZED=false. O validador não exibe os valores. Não cole segredos em commits ou chamados.
3. Antes de trocar chaves existentes, preserve cópias protegidas. Se documentos foram cifrados com JWT_SECRET, informe esse valor apenas como DATA_ENCRYPTION_LEGACY_SECRET, e use uma nova DATA_ENCRYPTION_SECRET. Execute scripts/rotacionar-documentos.js em janela de manutenção sem escrita concorrente e valide recuperação dos registros. O script recifra documentos e recalcula hashes por empresa em transação; falha em documento ilegível. Apague a configuração legada só após verificação e definição de tratamento dos backups.
4. A fila de e-mails de recuperação não tem rotação automática: drene a fila antes de trocar EMAIL_QUEUE_SECRET ou cancele e remova sua carga cifrada em manutenção, invalidando as recuperações correspondentes. Não mantenha e-mails antigos ilegíveis como se pudessem ser enviados. JWT novo encerra sessões antigas; FILE_URL_SECRET novo invalida os links assinados anteriores.
5. Execute npm run migrate. O patch 017 também cria whatsapp_numeros, seguranca_auditoria e o campo de revogação de compartilhamento do PDF. O migrador aceita SQL com BOM do Windows.
6. Cadastre, por canal administrativo de banco, o vínculo confiável do Phone Number ID Meta à empresa em whatsapp_numeros. Não use telefone do cliente como tenant. Um número pertence a uma única empresa; configure somente um número de saída por empresa nesta versão. O token Meta configurado deve ter acesso aos números vinculados. Nenhum vínculo é inferido ou criado automaticamente a partir de mensagens recebidas.
7. Configure WHATSAPP_APP_SECRET. Sem ele, o webhook retorna 503. Teste assinatura e roteamento antes de habilitar atendimento.
8. Publique backend e web coordenadamente e gere nova versão mobile. Reinicie sessão nos clientes. Verifique lembretes, notificações, filas pendentes e abertura de PDFs. Links já enviados sem assinatura precisarão ser emitidos novamente.

## Verificações

- npm test: 90 testes aprovados nesta revisao, incluindo testes funcionais e regressões de autorização, exportação, webhook, assinatura de PDF e exclusão.
- Testes offline executam o módulo mobile com SQLite real em memória e adaptador criptográfico Node AES-GCM, verificando separação entre contas, cache, fila e adulteração. Não substituem teste dos módulos nativos no aparelho.
- scripts/verificar-seguranca-postgres.js: usa SECURITY_TEST_DATABASE_URL, aceita somente loopback e nunca lê .env. Execute exclusivamente em banco descartável. Aplica migrações duas vezes e testa exclusão, revogação, senha, último ADMIN, curinga e unicidade normalizada em PostgreSQL real.
- Build Vite e exportação Expo verificam empacotamento. A câmera, SecureStore e AES nativos precisam de ensaio em Android/iOS antes de publicação.

## Pendências organizacionais e de infraestrutura

Esses pontos não podem ser resolvidos com código ou prazos inventados:

| Decisão | Responsável/evidência necessária |
|---|---|
| Identificar controlador e operador por operação | Contratos entre SaaS e empresas; dados reais do fornecedor |
| Base legal e necessidade de cada campo | Inventário e análise jurídica por finalidade; evitar consentimento genérico |
| Retenção por categoria | Matriz aprovada para cadastro, OS, documentos, fotos, assinatura, geolocalização, mensagens, auditoria e backups |
| Descarte integral e pedidos adicionais de titulares | Processo com verificação de identidade, análise das exceções, busca por todos os sistemas e registro de atendimento |
| Suboperadores/transferência internacional | Contratos e localização efetiva de banco, S3, Meta, Expo, SMTP e demais fornecedores |
| Incidentes | Responsável, contatos, classificação, ensaio e comunicação conforme regra aplicável da ANPD |
| Infraestrutura | Revisão IAM, banco/S3 privados, TLS, backups, restauração, proteção de aparelho e acesso administrativo |
| Dependências | Auditoria de CVEs e atualização validada em homologação |

A política pública foi ajustada para descrever os fluxos reais. Deve receber identificação e decisões de retenção aprovadas pelo controlador antes de ser tratada como versão jurídica final. Não representa certificação de conformidade com a LGPD.

Verificacao executada: 90 testes Node aprovados, build Vite e exportacao Expo concluidos, integracao PostgreSQL 16 isolada aprovada. O PostgreSQL temporario foi encerrado. Nenhuma migracao, rotacao de segredo ou alteracao de dados foi aplicada ao banco configurado no .env.
