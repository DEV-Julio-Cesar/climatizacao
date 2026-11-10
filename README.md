# ClimaSaaS

WhatsApp web: [recepção por serviço, configuração, simulador e passagem humana](docs/22-whatsapp-recepcao.md). Requer patch 013 antes de iniciar a API atualizada; homologação externa na Meta pendente.

Homologação de interface: [11 cenários de navegador e ambiente de componentes mobile](docs/21-homologacao-interface.md). Execute `npm run test:e2e` somente com `TEST_DATABASE_URL` em banco dedicado de testes.

Melhorias web/mobile: [solicitações de privacidade no aplicativo, filtros/histórico no painel e proteção de reenvios](docs/20-privacidade-web-mobile.md). Aplicar migrações da API antes de publicar os clientes atualizados.

Mobile 1.1.0: [proteção AES-GCM da fila/cache/evidências e homologação PostgreSQL](docs/19-homologacao-protecao-offline.md). Requer validar novo APK em aparelho antes de publicar.

Proteção de dados: [fluxos de privacidade, matriz de retenção e operação LGPD](docs/18-lgpd-protecao-dados.md). Aplique `npm run migrate` antes de publicar os novos protocolos de privacidade.

Documentação atualizada: [revisão do código e pendências de 09/11/2026](docs/17-revisao-documentacao-2026-11-09.md).
Estoque mobile: [entrada, saída, ajuste e histórico](docs/16-estoque-mobile.md).

Entrega anterior: [recuperação de senha com Gmail e atualizações em tempo real](docs/15-recuperacao-senha-tempo-real.md).

Mobile atualizado: [assinatura, galeria e tema](docs/14-mobile-assinatura-galeria-tema.md).

Entrega anterior: [implementação das pendências e implantação](docs/13-implementacao-pendencias.md). Aplique `npm run migrate` antes de iniciar a API atualizada.

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
web/                    painel React/Vite
src/                    API Express
  controllers/          regras de negócio
  routes/               endpoints REST
  database/             conexão e migração PostgreSQL
  middlewares/          autenticação e perfis
test/                   testes automatizados da API
```

## Executar a API

Para validar alterações durante o desenvolvimento, use `npm run validate`. O comando seleciona os componentes afetados, executa verificações independentes em paralelo e reaproveita resultados aprovados sem mudanças. `npm run validate:plan` mostra a seleção; `npm run validate:full` força testes e builds completos. O CI continua executando a validação completa. Detalhes em [validação rápida](docs/11-validacao-rapida.md).

Requisitos: Node.js 22 (usado no Docker e no Render) e PostgreSQL. Copie `.env.example` para `.env`, configure `DATABASE_URL` e `JWT_SECRET` e execute:

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

O perfil `preview` gera um APK instalável para a turma. O perfil `production` gera AAB para a Play Store. Veja [implantação e validação](docs/10-correcoes-e-validacao.md).

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
