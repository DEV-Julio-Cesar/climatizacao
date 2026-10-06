# Homologação e publicação

## API de produção

1. Hospede a API Node em um serviço com HTTPS e armazenamento persistente para `tmp/uploads`.
2. Configure `DATABASE_URL`, `JWT_SECRET` forte, `APP_URL` público e `CORS_ORIGIN` restrito.
3. Execute `npm run migrate` antes de iniciar a nova versão.
4. Confirme `/health` e publique `/privacidade` em URL acessível.

### Render

O arquivo `render.yaml` cria o serviço gratuito `climasaas-api`. No painel do Render, escolha **New > Blueprint**, conecte o repositório GitHub e informe os segredos solicitados. A URL pública será detectada automaticamente pela aplicação por `RENDER_EXTERNAL_HOSTNAME`.

## Aplicativo Android

Na pasta `mobile`, crie `.env.production` com `EXPO_PUBLIC_API_URL=https://...`.

```powershell
npm install
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

O perfil `preview` gera APK para homologação. Para a Play Store:

```powershell
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform android --profile production
```

Antes da publicação, substitua o e-mail da política de privacidade se necessário, configure os dados reais da empresa e remova/troque a senha do usuário demonstrativo.

Na primeira execução, `build:configure` vincula o projeto à conta `dev-julio-cesar` e grava o `projectId` gerado pelo EAS no `app.json`.
