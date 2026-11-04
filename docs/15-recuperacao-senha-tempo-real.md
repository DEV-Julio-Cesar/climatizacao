# Recuperação de senha e tempo real — 29/10/2026

## Fluxo de recuperação

- Painel e mobile possuem “Esqueci minha senha”. O link abre a redefinição no painel web, também utilizável pelo navegador do celular.
- Resposta de solicitação é igual para e-mail inexistente, usuário inativo e usuário válido. Não retorna link nem token ao solicitante.
- Token aleatório de 256 bits, validade de 15 minutos, hash SHA-256 no banco e consumo atômico. Novo pedido invalida o link anterior.
- A troca da senha e a revogação de todas as sessões ficam na mesma transação. Links pendentes também são invalidados. Login e alteração autenticada usam lock do usuário para não emitir sessão com senha antiga durante uma redefinição.
- Limites por IP, e-mail normalizado e token. Há ainda limite persistente de três pedidos por usuário em 15 minutos, inclusive entre instâncias da API.
- Link usa fragmento (`#redefinir-senha?token=...`), sem expor o token na URL enviada ao servidor. Após abrir a página, o navegador remove o token da barra e mantém em memória. Se recarregar a página, abra novamente o link original do e-mail.
- E-mail fica em fila persistente, cifrada com AES-256-GCM. Worker tenta até cinco vezes, sem enviar tokens expirados/consumidos. Conteúdo cifrado é apagado após envio, consumo ou limpeza de pedidos expirados. Logs guardam código do erro SMTP, sem senha, token ou corpo do e-mail.

## Configurar Gmail

1. Na conta remetente, ative verificação em duas etapas e crie uma **senha de app**, se disponível na conta. Não use a senha normal do Gmail. Contas gerenciadas podem depender da política do administrador. Veja as [instruções oficiais do Google](https://support.google.com/accounts/answer/185833?hl=pt-BR).
2. Configure no `.env` local ou nos segredos do ambiente de produção:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seuemail@gmail.com
SMTP_FROM=seuemail@gmail.com
SMTP_PASS=
PASSWORD_RESET_URL=https://SEU_DOMINIO/painel/
```

Preencha `SMTP_PASS` com a senha de app, sem espaços de apresentação, somente no ambiente. Não envie pelo chat e não versione `.env`. `SMTP_FROM` pode ser omitido para usar `SMTP_USER`; use remetente autorizado pela conta. As portas e TLS seguem a [documentação SMTP do Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp).

`PASSWORD_RESET_URL` deve abrir o painel atualizado. Em produção exige HTTPS. Para abrir o e-mail pelo celular, use um domínio público; `localhost` aponta para o próprio celular. Em desenvolvimento no computador, pode usar `http://localhost:3000/painel/` com o painel compilado.

Opcionalmente configure `EMAIL_QUEUE_SECRET` com um segredo forte e estável, independente do JWT. Quando omitido, a chave é derivada do `JWT_SECRET`. Trocar o segredo antes do envio impede decifrar os e-mails já enfileirados; links vencem em 15 minutos.

3. Instale dependências e verifique autenticação sem enviar mensagem:

```powershell
npm ci
npm run email:verify
```

4. Aplique `npm run migrate`, compile o painel (`npm --prefix web run build`) e reinicie a API. Publique também a atualização mobile.
5. Solicite recuperação de uma conta de teste cadastrada. Confira caixa de entrada/spam, expiração, uso único e login com a nova senha. Antes de configurar SMTP, a API responde 503 para todos os pedidos, sem fingir que enviou e-mail.

Nesta entrega, a verificação local retornou `SMTP_NOT_CONFIGURED`. Nenhum e-mail real foi enviado. Faltam os dados da conta no ambiente para homologar o envio Gmail.

Depois da escolha do remetente, servidor/porta/TLS/usuário/remetente foram preenchidos no `.env` local, ignorado pelo Git. A senha de app continua em branco. Preencha-a no ambiente e execute novamente `npm run email:verify`; credenciais reais não foram usadas nos testes.

## Tempo real no painel

- SSE autenticado com Bearer, sem credenciais na URL. Uma conexão é compartilhada pelas telas do painel.
- PostgreSQL dispara notificações depois do commit para mudanças em OS, fotos, pagamentos, conversas e mensagens. Instâncias da API recebem pelo `LISTEN/NOTIFY`.
- Eventos contêm apenas tipo de atualização, filtrado por empresa/permissão. As telas consultam a API REST para carregar os dados com as autorizações atuais.
- WhatsApp substitui polling de 5/8 segundos por eventos; Agenda de Despacho, Mapa da Equipe e Dashboard também atualizam.
- Reconexão faz nova leitura dos dados; não há histórico de eventos. Durante indisponibilidade, telas voltam a consultar a cada 30 segundos. Há debounce para agrupar mudanças próximas, heartbeat e detecção de conexão parada.
- Conexões são renovadas em até 60 segundos para revalidar sessão/permissões; expiração do JWT pode fechar antes. Revogação bloqueia imediatamente novas leituras REST; o stream antigo só contém avisos genéricos até ser fechado. Limite de cinco abas/conexões por usuário.

Se `DATABASE_URL` usar pool transacional incompatível com `LISTEN`, configure `REALTIME_DATABASE_URL` com uma conexão direta para o **mesmo banco**. Cada processo da API mantém uma conexão adicional. Proxy deve preservar streaming, desativar buffering e permitir `/eventos`; a API envia `X-Accel-Buffering: no` e `Cache-Control: no-store, no-transform`.

Tempo real foi aplicado ao painel web. O mobile continua usando push, leitura ao abrir telas e sincronização offline.

## Banco e rotas

- `009_recuperacao_senha.sql`: pedidos de recuperação e fila cifrada de e-mails.
- `010_eventos_tempo_real.sql`: função e triggers de notificação por empresa.
- `POST /auth/senha/solicitar` com `{ "email": "..." }`.
- `POST /auth/senha/redefinir` com `{ "token": "...", "nova_senha": "..." }`.
- `GET /eventos` autenticado, resposta `text/event-stream`.

`npm start` inicia os workers e a conexão de eventos. Instanciar apenas `createApp()` nos testes não envia e-mails nem conecta o listener.

## Verificação

Validação local: 77 testes aprovados e um teste PostgreSQL ignorado por falta de banco de testes. Compilação do painel e exportação mobile aprovadas.

Testes locais cobrem geração/hash/cifra, expiração, consumo único concorrente, revogação, limite por conta/token com IPs diferentes, corrida de login, retry SMTP, dados sensíveis, isolamento SSE, limite de conexões e parsing de mensagens fragmentadas. Compilação web e exportação mobile verificam integração do código.

O teste PostgreSQL opcional também verifica validade exata de 15 minutos, uma única redefinição concorrente, revogação de sessões e notificação real por trigger. Depende de `TEST_DATABASE_URL`; localmente não foi executado por falta de banco de testes. Nenhuma migração foi aplicada ao banco configurado nesta entrega. Envio real Gmail, domínio/cookies, proxy SSE e fluxo no aparelho ainda precisam de homologação.
