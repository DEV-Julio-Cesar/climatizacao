# ClimaSaaS - Resumo para Apresentação

## 🎯 Problema e Solução

**Problema:** Empresas de climatização controlam visitas em papel ou mensagens, causando perda de evidências, retrabalho e dificuldade de rastreamento.

**Solução:** App mobile que centraliza todo o fluxo operacional, do agendamento ao relatório assinado, com funcionamento offline e sincronização automática.

**Usuários:** 
- Técnicos de campo (agenda, execução, fotos, assinatura)
- Gestores (acompanhamento, orçamentos, estoque, relatórios)

---

## 🏗️ Arquitetura

```
App Mobile (React Native + Expo)
    ├─ Navegação: Stack + Tab
    ├─ Estado: Context API + Hooks
    ├─ Persistência: SecureStore + AsyncStorage + SQLite
    ├─ Recursos: Câmera, GPS, Notificações, Vibração
    └─ Comunicação: API REST via HTTPS
              ↓
API Node.js/Express + PostgreSQL
    ├─ Autenticação: JWT
    ├─ Clientes, Equipamentos, Ordens de Serviço
    └─ Gestão, Financeiro, Catálogo
```

---

## 📱 Funcionalidades Principais

### Fluxo do Técnico
```
Login → Agenda do Dia → Selecionar Visita → "A Caminho" (GPS)
  ↓
Check-in (GPS obrigatório) → Checklist → Fotos com GPS
  ↓
Relatório Técnico → Consumo de Materiais → Assinatura Digital
  ↓
Check-out (GPS) → PDF Gerado → Compartilhamento
```

### Funcionalidade Offline
- Todas as operações funcionam sem internet
- Fila SQLite armazena: fotos, eventos, relatórios, finalizações
- Sincronização automática ao voltar online
- Ordem correta garantida (eventos → fotos → finalização)

---

## ✅ Requisitos da UC Implementados

| Requisito | Implementação | Localização |
|-----------|---------------|-------------|
| **React Native** | Framework base | `mobile/` |
| **Expo** | SDK e gerenciamento | `app.json`, `eas.json` |
| **Componentes Nativos** | View, Text, TextInput, FlatList, Switch, Alert, Vibration | Todas as telas |
| **useState** | Estado local | Ex: `CameraOS.js` linha 8-12 |
| **useEffect** | Carregamento de dados | Ex: `AgendaMapa.js` linha 15 |
| **Stack Navigation** | Fluxo de telas (Login → O.S. → Câmera → Assinatura) | `App.js` linha 35-75 |
| **Tab Navigation** | 4 abas principais (Agenda, Clientes, Gestão, Perfil) | `App.js` linha 25-33 |
| **Link** | Telefone, WhatsApp, Maps, PDF, Política | `Linking.openURL()` |
| **Context API** | Preferências globais | `src/context/AppContext.js` |
| **AsyncStorage** | Preferências, cache | `@react-native-async-storage/async-storage` |
| **SecureStore** | Token JWT, usuário | `expo-secure-store` |
| **SQLite** | Fila de sincronização offline | `src/database/sqlite.js` |
| **Notificação** | Push (Expo) + Local | `src/services/notifications.js` |
| **Vibração** | Feedback tátil | `PerfilScreen.js`, `CameraOS.js` |
| **Informações Dispositivo** | SO, marca, modelo, tipo | `expo-device` em `PerfilScreen.js` |
| **Geolocalização** | GPS em eventos críticos | `expo-location` |
| **API REST** | Backend autenticado | Node.js + Express + PostgreSQL |
| **Instalador Android** | APK + AAB | EAS Build (`eas.json`) |

**Status: 18/18 ✅**

---

## 🔧 Tecnologias e Justificativas

### Por que React Native?
- Código compartilhado iOS e Android (95% reutilização)
- Desenvolvimento 2x mais rápido que apps nativos
- Performance próxima ao nativo (95%)
- Comunidade ativa e bibliotecas maduras

### Por que Expo?
- Zero configuração de Xcode/Android Studio
- APIs nativas prontas (câmera, GPS, notificações)
- Build na nuvem (não precisa Mac para iOS)
- OTA Updates (correções sem reenviar à loja)

### Por que Context API (ao invés de Redux)?
- Estado simples (apenas preferências)
- Menos boilerplate (sem actions/reducers)
- Integrado ao React (zero dependências extras)
- Redux seria "over-engineering" para este caso

### Por que SQLite (ao invés de Realm)?
- SQL é linguagem universal
- Maturidade e estabilidade comprovadas
- Melhor para fila de sincronização (nosso caso de uso)
- Realm é melhor para sincronização bidirecional complexa

### Por que JWT (ao invés de sessões)?
- Stateless (servidor não guarda sessões)
- Escalável horizontalmente
- Funciona bem com múltiplos dispositivos
- Token expira automaticamente (segurança)

### Por que SecureStore (ao invés de AsyncStorage)?
- Criptografia nativa do SO (Keychain iOS / Keystore Android)
- Essencial para tokens de autenticação
- AsyncStorage é texto puro (não criptografado)

---

## 💾 Armazenamento de Dados

### 1. Context API (Estado Global)
**O que armazena:** Preferências (notificações, vibração)  
**Por quê:** Evita passar props por 10 níveis de componentes

### 2. AsyncStorage (Persistência Simples)
**O que armazena:** Preferências, última localização  
**Por quê:** Chave-valor assíncrono, não bloqueia UI

### 3. SecureStore (Dados Sensíveis)
**O que armazena:** Token JWT, dados do usuário  
**Por quê:** Criptografado nativamente pelo SO

### 4. SQLite (Banco Local)
**O que armazena:** Fila de sincronização offline  
**Por quê:** Banco relacional completo, transações ACID

**Estrutura:**
```sql
CREATE TABLE fila_sync (
  id INTEGER PRIMARY KEY,
  tipo TEXT,              -- EVENTO_OS, FOTO_OS, STATUS_OS
  payload TEXT,           -- JSON da operação
  tentativas INTEGER,
  created_at TEXT
);
```

---

## 📡 Recursos do Dispositivo

### Câmera (`expo-camera`)
- Captura de evidências durante atendimento
- Otimização automática (resize 1200px, compress 75%)
- Metadados: GPS, data/hora, comentário

### Geolocalização (`expo-location`)
- Check-in/out obrigatório com GPS
- Validação de presença física
- Mapa de rota do dia com geocodificação
- Precisão: Balanced (~100m)

### Notificações (`expo-notifications`)
- Push notifications via Expo
- Notificações locais de teste
- Canal Android configurado

### Vibração (`Vibration`)
- Feedback tátil em ações importantes
- Confirmação de localização registrada
- Padrão customizável

### Informações do Dispositivo (`expo-device`)
- SO e versão (Android 13, iOS 17)
- Marca e modelo (Samsung, iPhone)
- Tipo (Phone, Tablet)
- Detecta emulador

### QR Code
- Leitura: `expo-camera` com `barcodeScannerSettings`
- Geração: `react-native-qrcode-svg`
- Formato: `climasaas://equipamento/123`

### Assinatura Digital (`react-native-signature-canvas`)
- Canvas HTML5 em WebView
- Exporta PNG base64
- Vinculada à finalização da O.S.

### Mapas (`react-native-maps`)
- Mapa nativo iOS/Android
- Markers, Polyline, região customizável
- Integração com Google Maps/Apple Maps

---

## 🔌 Integração com API

### Autenticação JWT
```javascript
// 1. Login
const { token, usuario } = await api.login(email, senha);
await SecureStore.setItemAsync('climasaas_token', token);

// 2. Requisições autenticadas
headers: { 
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}

// 3. Token expirado → logout automático
if (response.status === 401) {
  await SecureStore.deleteItemAsync('climasaas_token');
  voltarParaLogin();
}
```

### Endpoints Principais
- `POST /login` - Autenticação
- `GET /os/agenda` - Lista visitas
- `POST /os/:id/eventos` - Check-in, check-out, "a caminho"
- `PATCH /os/:id/status` - Muda status da O.S.
- `POST /os/fotos` - Upload multipart/form-data
- `GET /clientes` - Lista clientes
- `POST /equipamentos` - Cadastra equipamento

### Upload de Arquivos
```javascript
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

const form = new FormData();
form.append('imagem', new File(foto.uri), 'foto.jpg');

await expoFetch(`${API}/os/fotos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form
});
```

---

## 📦 Geração do Aplicativo

### Configuração EAS Build (`eas.json`)

```json
{
  "build": {
    "preview": {
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

### Perfil Preview (Para a Turma)
```powershell
npx eas-cli build --platform android --profile preview
```
- **Gera:** APK instalável diretamente
- **Compartilhamento:** Link de download válido por 30 dias
- **Uso:** Testes e apresentações

### Perfil Production (Google Play)
```powershell
npx eas-cli build --platform android --profile production
```
- **Gera:** AAB (Android App Bundle)
- **Otimização:** Google Play gera APKs específicos por dispositivo
- **Requisito:** Obrigatório para Play Store desde 2021

### Diferença APK vs AAB
- **APK:** Único arquivo, maior, instalável diretamente
- **AAB:** Google gera APKs otimizados por arquitetura (arm64, x86)

---

## 🎤 Roteiro de Apresentação (15-20 min)

### 1. Problema e Solução (2 min)
- Contextualizar empresas de climatização
- Apresentar dores dos técnicos
- Mostrar solução (app único, offline-first)

### 2. Demonstração Prática (10 min)

**Fluxo Completo:**
1. Login com usuário demo
2. Agenda: Filtrar "Hoje" e selecionar visita
3. Iniciar: Botão "A caminho" (GPS registrado)
4. Check-in: GPS obrigatório
5. Fotos: Tirar 2 fotos (GPS automático em cada uma)
6. Relatório: Preencher campos técnicos
7. Assinatura: Desenhar assinatura
8. Finalização: Check-out + PDF gerado

**Demonstração Offline (Impressionante!):**
1. **Durante** a visita, desligar Wi-Fi
2. Continuar tirando fotos
3. Finalizar O.S. completamente offline
4. Abrir tela "Sincronização" → mostrar fila SQLite
5. Religar Wi-Fi → sincronização automática

**Recursos do Dispositivo:**
- Perfil → Mostrar SO, marca, modelo
- Registrar localização (vibração + coordenadas)
- Testar notificação (notificação + vibração)
- Links: Telefone, WhatsApp, Maps

### 3. Código-fonte (3 min)
- Abrir `App.js`: Mostrar Stack + Tab Navigation
- Abrir `sqlite.js`: Mostrar fila de sincronização
- Abrir `CameraOS.js`: Mostrar captura com GPS

### 4. Requisitos Atendidos (2 min)
- Mostrar tabela 18/18 ✅
- Destacar diferenciais (offline robusto, GPS obrigatório)

### 5. Instalador (1 min)
- Mostrar `eas.json`
- Compartilhar link do APK com a turma

---

## 🎯 Perguntas Prováveis

**"Por que React Native e não nativo puro?"**
→ Código compartilhado iOS/Android, desenvolvimento 2x mais rápido, performance 95% do nativo

**"Por que não usar Redux?"**
→ Estado simples (preferências), Context API é suficiente. Redux seria over-engineering.

**"Como funciona offline?"**
→ SQLite enfileira todas as operações (fotos, eventos, finalizações) e sincroniza automaticamente

**"Como garante que o técnico está no local?"**
→ GPS obrigatório em check-in e check-out, validado no backend com coordenadas do cliente

**"Por que JWT e não sessões?"**
→ Stateless (escalável), funciona em múltiplos dispositivos, mobile-friendly

**"O app funciona 100% offline?"**
→ Login requer internet (primeira vez). Após login, todas as operações funcionam offline e sincronizam depois

**"Por que não Firebase?"**
→ Backend próprio dá controle total, evita vendor lock-in, permite customizações específicas

**"App funciona em iOS?"**
→ Sim, 95% do código é compartilhado. Build iOS requer conta Apple Developer ($99/ano)

---

## ✅ Checklist Pré-Apresentação

### Técnico
- [ ] API rodando em produção (URL HTTPS)
- [ ] `EXPO_PUBLIC_API_URL` configurado
- [ ] APK gerado e link funcionando
- [ ] Usuário demo criado (`demo@climasaas.com`)
- [ ] Dados de exemplo no banco (clientes, equipamentos, O.S.)

### Demonstração
- [ ] App instalado e logado no celular
- [ ] Internet 4G funcionando (testar antes)
- [ ] Bateria carregada (mínimo 50%)
- [ ] Brilho da tela no máximo (visibilidade)
- [ ] Notificações habilitadas
- [ ] GPS habilitado

### Backup
- [ ] Vídeo da demonstração gravado (se app crashar)
- [ ] Screenshots de todas as telas importantes
- [ ] Código aberto no VS Code (pontos-chave marcados)
- [ ] Slides ou PDF de apoio

---

## 🏆 Diferenciais do Projeto

### 1. Funcionalidade Offline Robusta
- Não apenas "exibe erro" quando offline
- Enfileira TODAS as operações (fotos, eventos, finalizações)
- Ordena corretamente (eventos antes de finalização)
- Retry automático com controle de tentativas

### 2. Validação de Presença Física
- GPS obrigatório em check-in e check-out
- Cada foto tem coordenadas vinculadas
- Auditoria geográfica completa
- Anti-fraude (impossível finalizar sem estar no local)

### 3. Permissões Granulares
- Não é apenas "admin" ou "técnico"
- Permissões: `CLIENTES_VISUALIZAR`, `OS_EXECUTAR`, `FINANCEIRO_VISUALIZAR`, etc.
- Interface adapta dinamicamente (técnico só vê Agenda e Perfil)

### 4. QR Code em Equipamentos
- Técnico escaneia QR colado no ar-condicionado
- Abre ficha técnica instantaneamente
- Evita erro de identificação (modelo, número de série)

### 5. Sistema Completo (Não é Protótipo)
- Backend real em produção
- Instalador gerado e funcional
- Fluxo completo de ponta a ponta
- Poderia ser usado por empresas reais

---

## 📊 Resumo Final

**Problema Real:** ✅ Digitalização de empresas de climatização  
**Usuários Definidos:** ✅ Técnicos e gestores  
**Funcionalidades Completas:** ✅ 25+ telas organizadas  
**Interface Profissional:** ✅ Design system consistente  
**Navegação:** ✅ Stack + Tab com lógica condicional  
**Armazenamento:** ✅ Context + AsyncStorage + SecureStore + SQLite  
**API:** ✅ Backend Node.js com JWT  
**Recursos do Dispositivo:** ✅ Câmera, GPS, notificações, vibração, info  
**Testes:** ✅ Automatizados (Jest) + Validação de build  
**Instalador:** ✅ APK compartilhável + AAB para produção  

**Requisitos da UC: 18/18 ✅**

---

**Este é um sistema completo e funcional, não apenas um protótipo acadêmico.**

Boa apresentação! 🚀
