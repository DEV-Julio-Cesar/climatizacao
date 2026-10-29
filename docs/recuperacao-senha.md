# Recuperação de senha no painel

O botão **Esqueci minha senha** aparece abaixo de **Entrar no painel**. O destinatário é o e-mail cadastrado na conta, que pode ser diferente do remetente SMTP.

O link expira em 15 minutos, funciona uma vez e invalida as sessões após a redefinição. Há limites por IP, e-mail e token, além de limite persistente por conta. A resposta não informa se o endereço existe. Os e-mails aguardam envio em uma fila cifrada no banco.

## Ambiente do Render

Configure SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_SECURE=true, SMTP_USER e SMTP_FROM com o remetente Gmail. SMTP_PASS recebe a senha de app do Google, exclusivamente no ambiente. Configure PASSWORD_RESET_URL=https://climasaas-api.onrender.com/painel/ e mantenha JWT_SECRET estável. EMAIL_QUEUE_SECRET é opcional; quando ausente, a cifra usa uma chave derivada de JWT_SECRET. Não publique credenciais no repositório.

O comando de inicialização permanece `npm run migrate && npm start`. A migração aplica os patches 003 (sessões) e 009 (recuperação e fila), além dos anteriores. Após esta atualização, as sessões antigas exigem um novo login.

Para verificar apenas a conexão SMTP, execute `npm run email:verify` com as variáveis configuradas. Em seguida, teste pelo painel com uma conta cujo e-mail você recebe: solicite o link, redefina a senha e confirme que o link usado e as sessões anteriores são recusados. Os testes automatizados simulam o banco e SMTP; não enviam e-mail real.
