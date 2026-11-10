# Homologação e proteção offline — 09/11/2026

Esta entrega continua o [trabalho de LGPD](./18-lgpd-protecao-dados.md). Ela protege os conteúdos da fila/cache e evidências offline e exercita as migrações e controles do backend em PostgreSQL temporário real. Não certifica adequação à LGPD nem comprova segurança de um aparelho comprometido.

## Proteção implementada

- `OfflineCrypto.js`: AES-256-GCM com nonce aleatório de 12 bytes e tag de 16 bytes, utilizando `expo-crypto` já instalado. A chave fica no `expo-secure-store`, com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; não é salva no SQLite, nos arquivos de evidência, no código ou nos logs. Há uma chave por instalação/dispositivo, não uma chave independente por usuário.
- AAD vincula payloads da fila à conta, tipo e UUID; erros são cifrados com contexto próprio. Cache é cifrado com contexto da chave completa. Mover o conteúdo para outra conta/chave ou adulterar bytes provoca erro de autenticação. O identificador de cache usa SHA-256, para não persistir o texto da busca em claro no nome da entrada. Hash não equivale a cifragem e pode permitir inferência de valores previsíveis; metadados não são considerados anônimos.
- Fotos e assinaturas novas são gravadas em arquivos `.climaenc` no diretório privado `climasaas-cofre/`, com nome aleatório e autenticação vinculada ao nome. A câmera passa a salvar/enfileirar antes de tentar sincronizar; erros de rede não deixam uma evidência recém-capturada sem proteção persistente na fila.
- Upload: a imagem é decifrada apenas em arquivo temporário no diretório privado `cache/climasaas-upload/`, com extensão JPEG/PNG correspondente. O temporário é removido em `finally`, inclusive em falha. Arquivos temporários de upload abandonados são limpos ao iniciar. O arquivo cifrado só é removido depois da confirmação e da remoção efetiva da operação da conta ativa.
- Na câmera, originais de captura são limpos depois do processamento e a prévia é limpa ao refazer/sair. Prévia e upload ainda exigem temporários em claro; não há promessa de ausência absoluta de imagem em claro durante uso, nem de limpeza após qualquer interrupção do processo.
- `Perfil → Limpar dados consultados nesta conta`: remove somente cache da conta ativa e bloqueia a ação se houver operações pendentes. Não remove fila, fotos, outras contas, legado ou servidor. Logout mantém pendências para sincronização posterior.
- A localização de demonstração exibida no Perfil permanece só em memória; a preferência antiga `@climasaas/ultima_localizacao`, que não era relida pela tela, é removida ao iniciar. Registros GPS de atendimento permanecem preservados nos payloads protegidos.
- Perfil delega logout ao fluxo central, sem apagar os tokens antes da revogação no servidor.
- Android: `allowBackup: false`. Essa configuração depende de novo binário e não garante bloqueio de todas as transferências entre dispositivos em todos os fabricantes. A chave não deve ser restaurada como texto junto do banco.

## Migração dos dados existentes

1. Abre o SQLite existente, ativa `secure_delete`, cria `offline_config` e `offline_limpeza` e obtém a chave no armazenamento seguro.
2. Um verificador autenticado identifica uma instalação já protegida. Se a chave sumir ou for incompatível, a abertura falha preservando os dados. Não há geração silenciosa de chave substituta para um banco marcado como protegido.
3. Em transação exclusiva nativa, cifra payloads e erros de todas as contas/legado, protege arquivos referenciados pela fila e transforma chaves/valores de cache. A migração não atribui legado à conta atual. Arquivo referenciado que já não existe mantém a operação na fila, para análise posterior.
4. Arquivos antigos só são removidos após commit. Se falhar antes, a fila/original permanecem e as novas cópias criadas são descartadas. Referências de limpeza pendente ficam em tabela própria para nova tentativa caso a remoção do original falhe depois do commit.
5. Checkpoint, `VACUUM` e novo checkpoint reduzem resíduos nos arquivos SQLite/WAL. Não garantem apagamento físico de flash, snapshots ou backups antigos. Caches antigos sem conta permanecem isolados sob chaves de legado.
6. Recuperação autorizada de legado decifra e cifra novamente com o contexto da conta de destino, dentro de transação. UUIDs e ordem das operações continuam preservados. Troca de conta durante lote/leitura é rejeitada.

Se a abertura falhar, o app apresenta tentativa de reabertura e orienta não desinstalar. Perder a chave, limpar os dados do app, desinstalar ou perder o aparelho pode tornar as pendências irrecuperáveis. Sincronizar continua essencial; cifra não substitui continuidade operacional.

## Escopo e limites

Não é SQLCipher: a estrutura SQLite e metadados como conta, tipo de operação, UUID, datas e contagem continuam visíveis. A proteção se aplica aos conteúdos citados e não a todo arquivo do sistema operacional. SecureStore protege a chave conforme as garantias do SO; o aplicativo em execução pode decifrar os dados. Não há biometria, bloqueio de captura de tela, MDM ou apagamento remoto nesta entrega.

PDFs compartilhados/salvos pelo usuário, caches de imagens de bibliotecas, notificações exibidas pelo sistema e arquivos exportados para outros aplicativos não entram automaticamente nesse cofre. Notificações locais ainda podem revelar informação na tela bloqueada: configurar a privacidade do sistema e avaliar conteúdo mínimo. Preferências e mapas de IDs de lembretes continuam no AsyncStorage; não são o payload protegido de atendimento.

No web do aplicativo Expo não há fallback de chave em localStorage nem armazenamento offline em claro. Sem SecureStore disponível, a inicialização protegida é bloqueada. A exportação web valida o bundle; não prova funcionamento do cofre no navegador. O painel React em `web/` continua independente.

## Publicação

- App configurado como versão/runtime `1.1.0`, Android `versionCode=2`. Gerar e homologar novo APK; a alteração de backup é nativa. Não reduzir versão/runtime ou retornar a um cliente que espera payload JSON em claro após migrar a fila. Não remover a chave do SecureStore no logout.
- Não houve publicação, geração de APK/AAB ou acesso ao banco operacional nesta entrega. Não há patch PostgreSQL novo além do 011 da entrega LGPD anterior. Execute `npm run migrate` antes de publicar aquela API.
- Atualizar um aparelho com pendências exige testar migração interrompida, reconexão e recuperação de chave disponível. Não usar aparelhos reais de técnicos como primeira homologação nem recomendar desinstalação como tentativa de correção.

## Homologação automatizada

Resultado final: **117 testes aprovados, nenhuma falha e nenhum teste ignorado**, com PostgreSQL real. A exportação web do aplicativo (`npm --prefix mobile run check`) passou. Links locais da documentação e `git diff --check` foram verificados. Não houve teste visual em navegador, execução do módulo AES/arquivos no aparelho, geração de APK ou teste de restauração de backup.

PostgreSQL 17.9 instalado localmente foi iniciado em cluster temporário dentro de `tmp/`, com senha aleatória, autenticação SCRAM e escuta somente em `127.0.0.1`. A suíte recebe exclusivamente `TEST_DATABASE_URL` desse cluster; não utiliza `DATABASE_URL`. O servidor temporário foi encerrado após os testes. Senhas não foram gravadas no repositório nem impressas na saída.

Foram exercitados schema/patches reaplicados, agenda e pagamentos concorrentes, recuperação de senha e notificações PostgreSQL, protocolos isolados entre empresas, resumo pessoal e rollback da desativação quando a auditoria falha. O teste real não cobre automaticamente todas as rotas e combinações de permissões da aplicação.

Os testes offline usam SQLite real do Node e um adapter da API AES do Expo baseado em AES-GCM real do Node. Cobrem nonce distinto, AAD, adulteração, perda da chave, migração/rollback de payloads e fotos, remoção após commit, retomada de limpeza pendente, chave de cache sem busca em claro, temporários em sucesso/falha, travessia de caminhos e limpeza restrita à conta. Há inspeção dos bytes de um arquivo SQLite migrado e seu WAL para um marcador pessoal de teste; isso não comprova apagamento físico de mídias.

O armazenamento de arquivos do teste é simulado e a chave não usa Keystore/Keychain reais. Homologação no aparelho continua obrigatória. O validador rápido inclui `offline-protecao.test.js` e seus helpers quando os serviços de proteção mudam.

## Checklist de aparelho antes de publicar

1. Instalação nova: entrar, consultar agenda, ativar modo avião, salvar fotos e assinatura/finalização; reiniciar o app e confirmar fila/dados legíveis apenas pela conta correspondente.
2. Atualização: usar uma instalação anterior com filas/cache/fotos, incluindo legado, e instalar o APK por cima sem desinstalar. Conferir conversão e preservação de UUIDs e sequência; simular interrupção e repetir a abertura.
3. Isolamento: trocar usuário/empresa, tentar limpeza com fila pendente e confirmar bloqueio; sem pendências, limpar cache e confirmar que outra conta permanece intacta.
4. Integridade: em build de teste, adulterar cópia do arquivo cifrado ou usar chave incompatível; o app deve rejeitar sem apagar a evidência. Nunca fazer isso no aparelho operacional.
5. Upload: reconectar, confirmar PNG da assinatura/JPEG das fotos, relatório e nome do assinante no PDF; simular falha após upload e confirmar que o reenvio não duplica evidência. Conferir limpeza dos temporários no sandbox nativo.
6. Bloqueio/reinício: testar aparelho bloqueado/desbloqueado, captura da câmera, retorno do segundo plano, encerramento forçado e espaço insuficiente. Conferir mensagens de falha e pendências preservadas.
7. Perda/roubo: ensaiar revogação de sessões e token push, registrar incidente e avaliar exposição de conteúdo offline/tela bloqueada. Sem MDM, não declarar apagamento remoto.

## Próximas ações organizacionais

Concluir homologação em aparelho e no domínio/cookies publicados; testar backup/restauração em ambiente isolado; aprovar matriz de bases/prazos de retenção antes de automatizar expurgo; nomear responsáveis pelos protocolos e monitorar prazos. Essas ações não foram substituídas pelos testes automatizados.

## Referências técnicas

- [Expo Crypto SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/): API AES-GCM usada pelo aplicativo.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/): limites de persistência, chaves e backup.
- [Configuração Expo do Android](https://docs.expo.dev/versions/latest/config/app/): `allowBackup`.
- [Android — Auto Backup](https://developer.android.com/identity/data/autobackup): diferenças de comportamento de backup e transferência entre aparelhos.
