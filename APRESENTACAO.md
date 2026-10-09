# Roteiro de apresentação — ClimaSaaS

## 1. Problema, usuário e solução

**Problema:** empresas de climatização perdem informações ao administrar agenda, execução, fotos e comprovantes em papel e aplicativos desconectados.

**Usuários:** técnicos de campo e gestores de pequenas empresas de instalação e manutenção de ar-condicionado.

**Solução:** um aplicativo único que organiza a visita técnica do agendamento ao relatório assinado, com cadastro de clientes/equipamentos, gestão e funcionamento offline.

## 2. Arquitetura

```text
App Expo / React Native
  ├─ Stack + Tab Navigation
  ├─ Context API + SecureStore + AsyncStorage
  ├─ SQLite (fila de sincronização offline)
  ├─ câmera, GPS, notificações, vibração e dados do aparelho
  └─ API REST via HTTPS
          ↓
API Node.js / Express → autenticação JWT → PostgreSQL
          ├─ clientes e equipamentos
          ├─ ordens, fotos e assinaturas
          └─ gestão, financeiro, catálogo e relatórios
```

## 3. Fluxo para demonstração

1. Entrar com o usuário de demonstração.
2. Mostrar as abas Agenda, Clientes, Gestão e Perfil.
3. Criar uma O.S. selecionando cliente, equipamento e serviço.
4. Abrir os detalhes, iniciar o atendimento e registrar fotos.
5. Preencher o relatório técnico, coletar assinatura e finalizar.
6. Abrir a O.S. finalizada e demonstrar PDF/compartilhamento.
7. Desligar a rede, criar uma O.S. e mostrar a fila SQLite; religar para sincronizar.
8. Em Perfil, exibir sistema, marca, modelo e tipo do aparelho; registrar GPS; testar notificação e vibração.
9. Mostrar os links de telefone, WhatsApp, Maps e política de privacidade.
10. Demonstrar os filtros da agenda e o ciclo “a caminho → check-in → execução → check-out”.
11. Mostrar o bloqueio de estoque insuficiente e a mudança das abas conforme as permissões do usuário.
12. Desligar a internet durante uma visita, concluir etapas e mostrar a central de sincronização.
13. Abrir o painel web, reagendar uma O.S. por arrastar e soltar e mostrar o mapa da equipe.

## 4. Requisitos atendidos

| Requisito | Implementação |
|---|---|
| React Native / Expo | projeto em `mobile/` |
| Componentes nativos | View, Text, TextInput, FlatList, Switch, Alert, Vibration etc. |
| Hooks | useState, useEffect, useCallback e useFocusEffect |
| Stack e Tab | `App.js`, fluxo principal e quatro abas |
| Link | telefone, WhatsApp, Maps, PDFs e política via Linking |
| Context API | `src/context/AppContext.js` |
| Storage | SecureStore e AsyncStorage |
| SQLite | fila offline em `src/database/sqlite.js` |
| Notificação | lembrete local na tela Perfil |
| Vibração | confirmação de localização e notificação |
| Dispositivo | SO, versão, marca, modelo, tipo e emulador/real |
| Geolocalização | coordenadas atuais sob permissão do usuário |
| API | backend Express/PostgreSQL autenticado com JWT |
| Testes | `npm test` na raiz e exportação Expo em `mobile` |
| Instalador | EAS `preview` (APK) e `production` (AAB) |

## 5. Testes e geração

```powershell
# API
npm test

# validação do bundle mobile
cd mobile
npm run check

# APK compartilhável
npx eas-cli build --platform android --profile preview
```

O link fornecido pelo EAS ao fim do build pode ser enviado à turma para instalar o APK.
