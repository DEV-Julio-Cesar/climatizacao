# ClimaSaaS

Aplicativo mobile para digitalizar o atendimento de empresas de climatização. O técnico recebe sua agenda, consulta cliente e equipamento, registra checklist e fotos, executa o serviço, coleta assinatura e finaliza a ordem de serviço. A gestão acompanha clientes, equipe, estoque, orçamentos e recebimentos.

## Problema e solução

Pequenas empresas de climatização frequentemente controlam visitas em papel ou mensagens, o que causa perda de evidências, retrabalho e dificuldade para acompanhar serviços. O ClimaSaaS concentra todo o fluxo em um app: da autenticação do técnico até o relatório final da O.S., inclusive com suporte offline e sincronização posterior.

## Tecnologias da UC

- React Native e Expo, com componentes nativos e hooks `useState`/`useEffect`.
- Stack Navigation para o fluxo das ordens e Tab Navigation para Agenda, Clientes, Gestão e Perfil.
- Context API para preferências globais; AsyncStorage para preferências/localização; SecureStore para sessão; SQLite para fila offline.
- API REST Node/Express com autenticação JWT e PostgreSQL.
- Links externos para telefone, WhatsApp, Maps, PDF e política de privacidade.
- Câmera, assinatura, QR Code, geolocalização, notificação local, vibração e informações do dispositivo.
- EAS Build configurado para APK de testes e AAB de produção.

## Fluxo operacional do técnico

- Agenda filtrável por hoje, atrasadas, próximas e todas as ordens abertas, com busca por cliente, endereço ou número.
- Eventos “a caminho”, check-in e check-out com data, hora, GPS e trilha de auditoria.
- Mapa do atendimento com marcador do cliente, posição atual, distância aproximada e abertura de rota no Google Maps/Apple Maps.
- Rota diária com múltiplas paradas, geocodificação automática e persistência das coordenadas do cliente.
- Fotos independentes durante o atendimento (mínimo de duas para concluir), relatório, assinatura e check-out por GPS.
- Fila SQLite para eventos, fotos, relatório e finalização, com central de sincronização e cache da agenda/O.S.
- Registro de dispositivo e notificações push Expo para novas atribuições e reagendamentos.
- Checklist configurável no banco por empresa e tipo de serviço.
- Medições de climatização, incluindo temperaturas, tensão, corrente, pressões, umidade, superaquecimento e sub-resfriamento.
- Consumo de materiais validado contra o catálogo e baixa transacional no estoque ao finalizar a O.S.
- Permissões granulares por usuário para agenda, O.S., clientes, estoque, financeiro e gestão.

## Estrutura

```text
mobile/                 aplicativo Expo/React Native
  src/context/          estado global (Context API)
  src/database/         SQLite e fila offline
  src/screens/          telas por domínio
  src/services/         API e sincronização
src/                    API Express
  controllers/          regras de negócio
  routes/               endpoints REST
  database/             conexão e migração PostgreSQL
  middlewares/          autenticação e perfis
test/                   testes automatizados da API
```

## Executar a API

Requisitos: Node.js 20+ e PostgreSQL. Copie `.env.example` para `.env`, configure `DATABASE_URL` e `JWT_SECRET` e execute:

```powershell
npm install
npm run migrate
npm run seed
npm test
npm start
```

A API responde em `http://localhost:3000/health`. O seed cria `admin@climasaas.com`, senha `123456`, apenas para demonstração.

## Executar o aplicativo

```powershell
cd mobile
npm install
$env:EXPO_PUBLIC_API_URL='http://SEU_IP_LOCAL:3000'
npm start
```

No emulador Android, use `http://10.0.2.2:3000`. Em aparelho físico, use o IPv4 do computador e mantenha os dois na mesma rede.

## Gerar instalador Android

```powershell
cd mobile
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

O perfil `preview` gera um APK instalável para a turma. O perfil `production` gera AAB para a Play Store. Veja [DEPLOY.md](DEPLOY.md) e [APRESENTACAO.md](APRESENTACAO.md).

Antes de executar a API atualizada, aplique `npm run migrate`. A migração cria os modelos de checklist, permissões e campos de geolocalização operacional de forma idempotente.

## Painel web

O painel em `web/` possui login, dashboard gerencial, agenda de despacho com reagendamento, mapa da equipe, clientes, estoque/contratos/orçamentos, permissões e editor de checklist.

```powershell
cd web
npm install
$env:VITE_API_URL='http://localhost:3000'
npm run dev
```

Para produção, execute `npm run build` e publique a pasta `web/dist` em hospedagem estática, configurando `VITE_API_URL` com a URL HTTPS da API.
