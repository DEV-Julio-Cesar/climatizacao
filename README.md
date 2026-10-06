# ClimaSaaS

MVP para gestão e execução de ordens de serviço de climatização. Inclui API Express/PostgreSQL e aplicativo Expo.

## Pré-requisitos

- Node.js 20 ou superior
- PostgreSQL/Neon configurado em `DATABASE_URL`
- Android com Expo Go ou emulador Android

## API

1. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
2. Instale e prepare o banco:

```powershell
npm install
npm run migrate
npm run seed
npm test
npm start
```

A API responde em `http://localhost:3000/health`. O seed local cria o usuário de demonstração `admin@climasaas.com` com senha `123456`; troque essa senha fora do ambiente de testes.

## Aplicativo mobile

```powershell
cd mobile
npm install
$env:EXPO_PUBLIC_API_URL='http://SEU_IP_LOCAL:3000'
npm start
```

- Emulador Android: use `http://10.0.2.2:3000`.
- Aparelho físico: use o IPv4 do computador e mantenha ambos na mesma rede.
- Pressione `a` no terminal do Expo para abrir o emulador ou leia o QR Code com o Expo Go.

## Fluxo validado

1. Login com JWT.
2. Listagem da agenda do técnico.
3. Criação de O.S. para cliente/equipamento.
4. Transição para atendimento em andamento.
5. Fotos de antes e depois.
6. Assinatura do cliente.
7. Finalização, PDF e envio opcional por WhatsApp.

## Configurações opcionais

O WhatsApp só é acionado quando `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_ACCESS_TOKEN` estão configurados. Uploads e PDFs são gravados em `tmp/uploads`; para produção, substitua por armazenamento persistente de objetos.

## Homologação Android

Os passos de infraestrutura, APK de homologação e AAB da Play Store estão em [`DEPLOY.md`](DEPLOY.md). A política de privacidade é disponibilizada pela API em `/privacidade`.
