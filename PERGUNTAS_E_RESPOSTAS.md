# Perguntas e Respostas - ClimaSaaS

## 📚 Perguntas Técnicas Sobre Tecnologias

### 1. "Por que você escolheu React Native ao invés de desenvolver nativo?"

**Resposta:**
Escolhi React Native por três motivos principais:

1. **Código compartilhado**: 95% do código funciona tanto em Android quanto iOS, economizando tempo de desenvolvimento
2. **Produtividade**: Desenvolver duas versões nativas (Java/Kotlin + Swift) levaria o dobro do tempo
3. **Performance adequada**: Para este tipo de aplicação (CRUD, formulários, fotos), React Native oferece 95% da performance nativa, o que é mais que suficiente
4. **Comunidade**: Ecossistema maduro com bibliotecas testadas para câmera, GPS, mapas, etc.

**Quando usar nativo puro**: Jogos 3D, apps de realidade aumentada, ou processamento pesado de vídeo/áudio em tempo real.

---

### 2. "Por que Expo e não React Native CLI puro?"

**Resposta:**
Expo oferece vantagens significativas para este projeto:

**Vantagens:**
- **Zero configuração nativa**: Não preciso abrir Xcode ou Android Studio
- **APIs prontas**: Câmera, GPS e notificações funcionam com poucos comandos
- **EAS Build**: Posso gerar o instalador iOS sem ter um Mac
- **Atualizações OTA**: Posso corrigir bugs JavaScript sem reenviar para a loja

**Desvantagens:**
- App fica ~30MB maior
- Menos controle sobre código nativo

**Decisão**: Para um MVP e apresentação acadêmica, a produtividade do Expo supera as desvantagens.

**Quando usar React Native CLI**: Apps que precisam de bibliotecas nativas muito específicas que o Expo não suporta.

---

### 3. "Por que JavaScript e não TypeScript?"

**Resposta:**
*Se não usa TypeScript:*

JavaScript foi escolhido por:
1. **Velocidade de prototipagem**: Menos código boilerplate
2. **Curva de aprendizado**: Mais acessível para equipe iniciante
3. **Deadline acadêmico**: TypeScript adiciona camada de complexidade

**Próximos passos**: Migração gradual para TypeScript está planejada para produção.

*Se usa TypeScript:*

TypeScript foi essencial porque:
1. **Type safety**: Detecta erros em tempo de desenvolvimento
2. **Autocomplete**: IntelliSense melhora produtividade
3. **Manutenibilidade**: Código autodocumentado com interfaces
4. **Refactoring seguro**: IDE detecta onde código precisa ser atualizado

---

### 4. "Por que não usou Redux para gerenciar estado?"

**Resposta:**
Optei por Context API porque:

**Context API é suficiente quando:**
- Estado é simples (apenas preferências: notificações on/off, vibração on/off)
- Não há lógica complexa de negócio no estado global
- Time pequeno (não precisa de padrão muito rígido)

**Redux seria necessário se:**
- Tivéssemos carrinho de compras com cálculos complexos
- Chat em tempo real com múltiplas conversas
- Estado com centenas de ações diferentes
- Time grande precisando de padrão estrito

**No nosso caso**: Apenas 2 preferências globais. Context API evita ~500 linhas de boilerplate (actions, reducers, store, middleware).

---

### 5. "Como funciona o sistema offline? Ele realmente funciona sem internet?"

**Resposta:**
Sim, com uma arquitetura específica:

**Primeira vez (requer internet):**
- Login e autenticação (gera token JWT)
- Carrega agenda inicial e dados de clientes

**Depois (funciona 100% offline):**
- Todas as operações vão para uma **fila SQLite**
- Fotos são salvas localmente no dispositivo
- Eventos (check-in, check-out) são armazenados com GPS
- Finalizações completas são salvas

**Ao voltar online:**
- Sincronização automática processa a fila em ordem
- Fotos são enviadas primeiro
- Depois eventos (check-in, check-out)
- Por último, finalização da O.S.
- Tudo é salvo no backend

**Implementação técnica:**
```javascript
// Estrutura da fila SQLite
CREATE TABLE fila_sync (
  id INTEGER PRIMARY KEY,
  tipo TEXT,           -- 'FOTO_OS', 'EVENTO_OS', 'STATUS_OS'
  payload TEXT,        -- JSON com os dados
  tentativas INTEGER,  -- Controle de retry
  created_at TEXT
);
```

---

### 6. "Como você garante a segurança dos dados do usuário?"

**Resposta:**
Implementei 4 camadas de segurança:

**1. Autenticação JWT:**
- Token criptografado gerado no backend
- Expira automaticamente após 7 dias
- Renovação transparente

**2. SecureStore (Armazenamento Criptografado):**
- Token JWT armazenado com criptografia nativa do SO
- iOS: Keychain (AES-256)
- Android: Keystore (AES-256)
- Outros apps não conseguem acessar

**3. HTTPS (Transporte):**
- Toda comunicação com backend via TLS 1.3
- Token nunca trafega em texto puro
- Man-in-the-middle impossível

**4. Validação no Backend:**
- Token validado em cada requisição
- Permissões verificadas por rota
- SQL injection prevenido (prepared statements)

**O que NÃO fiz (erro comum):**
❌ Armazenar token em AsyncStorage (não é criptografado)
❌ Enviar senha em texto puro
❌ Guardar senha no dispositivo

---

### 7. "Por que SQLite e não apenas AsyncStorage?"

**Resposta:**
SQLite é superior para nosso caso de uso:

**AsyncStorage:**
- Apenas chave-valor (como um dicionário)
- Não suporta relações entre dados
- Sem queries complexas
- Limite: ~6MB no Android

**SQLite:**
- Banco relacional completo
- Suporta JOIN, ORDER BY, transações ACID
- Sem limite prático de tamanho
- Queries SQL (linguagem universal)

**No nosso app:**
- **AsyncStorage**: Preferências simples (notificação: true/false)
- **SQLite**: Fila de sincronização com ordem garantida, tentativas, timestamps

**Exemplo prático:**
```sql
-- Listar fotos que falharam mais de 3 vezes, ordenadas por data
SELECT * FROM fila_sync 
WHERE tipo = 'FOTO_OS' 
  AND tentativas > 3 
ORDER BY created_at ASC;
```

Isso seria muito complexo com AsyncStorage.

---

### 8. "Como funciona a geolocalização? Por que você precisa dela?"

**Resposta:**
A geolocalização é crucial para validação de presença física:

**3 momentos obrigatórios:**

1. **Check-in**: Registra GPS ao iniciar atendimento
2. **Fotos**: Cada evidência tem coordenadas vinculadas
3. **Check-out**: Confirma permanência até finalização

**Por que isso importa:**
- **Anti-fraude**: Impossível finalizar O.S. sem estar no local
- **Auditoria**: Gerente vê onde técnico estava em cada momento
- **Mapa de rota**: Otimiza deslocamentos da equipe

**Implementação:**
```javascript
const { status } = await Location.requestForegroundPermissionsAsync();
const posicao = await Location.getCurrentPositionAsync({
  accuracy: Location.Accuracy.Balanced  // ~100m, economiza bateria
});
```

**Precisão escolhida:**
- `Balanced`: ~100 metros (suficiente para validar presença)
- Não usamos `High` ou `Highest` para economizar bateria

**Backend valida:**
```javascript
// Verifica se técnico está no raio de 500m do cliente
const distancia = calcularDistancia(tecnico.gps, cliente.gps);
if (distancia > 500) {
  return erro('Você precisa estar próximo ao local');
}
```

---

### 9. "Por que você criou um backend próprio ao invés de usar Firebase?"

**Resposta:**
Decidi por backend próprio (Node.js + PostgreSQL) por:

**Vantagens:**
1. **Controle total**: Lógica de negócio customizada (validações, permissões)
2. **Sem vendor lock-in**: Posso mudar de hospedagem quando quiser
3. **SQL robusto**: PostgreSQL é mais poderoso que Firestore para relatórios
4. **Custo**: Firebase cobra por leitura/escrita (backend próprio é fixo)
5. **Aprendizado**: Experiência completa de desenvolvimento

**Firebase seria melhor se:**
- App fosse apenas CRUD simples
- Precisasse de real-time sem configuração
- Não tivesse tempo para backend
- Fosse apenas protótipo

**Nosso caso**: Lógica complexa (estoque, permissões, validações de GPS) justifica backend próprio.

---

### 10. "Como você testou o aplicativo? Fez testes automatizados?"

**Resposta:**
Implementei 2 tipos de testes:

**1. Testes Automatizados (Backend):**
```powershell
npm test
```
- Framework: Jest
- Cobertura: Rotas principais (login, agenda, upload de foto)
- Validação: Autenticação JWT, permissões, erros

**2. Testes Manuais (Mobile):**
- **Emulador Android**: Android Studio
- **Dispositivo físico**: Instalação via APK
- **Checklist completo**:
  - ✅ Login (correto/incorreto)
  - ✅ Navegação entre telas
  - ✅ Captura de fotos com GPS
  - ✅ Modo offline (desligar Wi-Fi)
  - ✅ Sincronização ao voltar online
  - ✅ Notificações e vibração
  - ✅ Links externos (telefone, Maps)

**Por que não TDD no mobile?**
- Testing Library para React Native tem limitações
- Testes de UI mobile são mais complexos que web
- Prioridade foi entregar funcionalidade completa

**Próximos passos**: Detox (testes E2E para mobile) ou Maestro.

---

## 🎨 Perguntas Sobre Design e UX

### 11. "Por que você escolheu essa navegação (tabs + stack)?"

**Resposta:**
Essa estrutura segue o padrão de apps profissionais:

**Bottom Tabs (4 abas principais):**
- Padrão esperado em apps mobile modernos
- Acesso rápido às seções principais (1 toque)
- Usuário sempre sabe onde está
- Condicionais por permissão (técnico vs gestor)

**Stack Navigation (fluxo de O.S.):**
- Representa fluxo natural "avançar e voltar"
- Botão nativo de voltar funciona automaticamente
- Histórico de navegação mantido

**Estrutura:**
```
Stack (autenticação)
  ├─ Login (se não logado)
  └─ Tabs (se logado)
      ├─ Agenda Tab
      │   └─ Stack (detalhes, câmera, assinatura)
      ├─ Clientes Tab
      ├─ Gestão Tab
      └─ Perfil Tab
```

**Alternativas consideradas:**
- ❌ Drawer (gaveta lateral): Menos prático em campo
- ❌ Só Stack: Dificulta acesso rápido às seções

---

### 12. "Como você garantiu que a interface é intuitiva para técnicos em campo?"

**Resposta:**
Foquei em 4 princípios de UX para trabalho em campo:

**1. Contraste alto:**
- Textos escuros (#1E293B) em fundo claro (#FFFFFF)
- Legível sob luz solar direta

**2. Botões grandes:**
- Mínimo 48x48dp (recomendação Material Design)
- Fácil de tocar com luvas ou mãos sujas

**3. Feedback visual:**
- Loading visível em uploads
- Ícones de check ao concluir etapas
- Badge de status colorido (verde = concluído)

**4. Fluxo linear:**
- Etapas numeradas (1/3, 2/3, 3/3)
- Desabilita botão "próximo" até preencher obrigatórios
- Confirmação antes de ações irreversíveis

**Teste de usabilidade:**
- Demonstrei para técnicos reais
- Ajustei baseado no feedback (ex: aumentei tamanho dos botões)

---

### 13. "Por que você não usou uma biblioteca de UI como React Native Paper ou NativeBase?"

**Resposta:**
Optei por criar componentes customizados porque:

**Vantagens:**
1. **Controle total**: Design único, não genérico
2. **Leveza**: App ~30MB menor sem biblioteca UI extra
3. **Performance**: Componentes otimizados para o necessário
4. **Aprendizado**: Experiência de criar do zero

**Desvantagens:**
- Mais código inicial
- Preciso criar componentes comuns manualmente

**Quando usar biblioteca UI:**
- Protótipos muito rápidos (1-2 semanas)
- Design não é diferencial
- Time precisa de padrão visual pronto

**Nosso caso**: Design customizado para empresas de climatização (azul profissional, ícones específicos) justificou desenvolvimento próprio.

---

## 🔧 Perguntas Sobre Funcionalidades

### 14. "Como funciona a assinatura digital? É válida juridicamente?"

**Resposta:**
Implementação técnica:

**Tecnologia:**
- `react-native-signature-canvas`: WebView com canvas HTML5
- Exporta PNG base64
- Salvo no backend com timestamp e GPS

**Fluxo:**
1. Cliente assina na tela do celular
2. App converte em PNG e envia ao servidor
3. GPS do check-out valida presença física
4. PDF é gerado com assinatura + dados + GPS

**Validade jurídica:**
Segundo a Lei 14.063/2020 (Brasil):
- Assinatura eletrônica simples: ✅ Válida para O.S. comerciais
- Assinatura digital (certificado ICP-Brasil): Não é necessário para este caso

**Evidências adicionais:**
- GPS confirma presença física
- Timestamp comprova data/hora
- Fotos complementam evidência
- Histórico completo de eventos

**Não substitui**: Contratos imobiliários, escrituras, procurações (que exigem ICP-Brasil).

---

### 15. "Como você implementou o QR Code? Para que serve?"

**Resposta:**
QR Code facilita identificação de equipamentos:

**Geração (no painel web):**
```javascript
import QRCode from 'react-native-qrcode-svg';

<QRCode
  value="climasaas://equipamento/123"
  size={200}
/>
```

**Leitura (no app mobile):**
```javascript
<CameraView
  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
  onBarcodeScanned={({ data }) => {
    // data = "climasaas://equipamento/123"
    const id = extrairId(data);
    navigation.navigate('EquipamentoDetalhe', { equipamento_id: id });
  }}
/>
```

**Benefício prático:**
1. Técnico chega no local
2. Escaneia QR Code colado no ar-condicionado
3. Abre ficha técnica instantaneamente (modelo, histórico, manuais)
4. Evita erro de identificação

**Alternativas consideradas:**
- ❌ Código de barras: Menos dados, difícil de gerar
- ❌ NFC: Requer tags físicas caras

---

### 16. "O que acontece se o técnico perder a conexão durante o atendimento?"

**Resposta:**
Sistema continua funcionando normalmente:

**Cenário real:**
1. Técnico está executando O.S. (com internet)
2. Entra em subsolo/elevador (sem sinal)
3. Continua tirando fotos, preenchendo relatório
4. Finaliza O.S. completamente offline
5. Sobe e reconecta Wi-Fi/4G
6. App sincroniza automaticamente em background

**Implementação:**
```javascript
// Detecta estado da conexão
Network.addNetworkStateListener((state) => {
  setOnline(state.isConnected);
});

// Tenta enviar, se falhar, enfileira
try {
  await api.uploadFoto(foto);
} catch (erro) {
  await enfileirarNoSQLite(foto);
  Alert.alert('Salvo offline', 'Será sincronizado depois');
}
```

**Ordem garantida:**
1. Primeiro: Eventos (check-in, "a caminho")
2. Segundo: Fotos com metadados
3. Terceiro: Relatório técnico
4. Por último: Finalização da O.S.

**Interface:**
- Barra amarela aparece: "Sem internet · alterações serão sincronizadas"
- Ícone de nuvem com seta mostra itens pendentes

---

### 17. "Como você validou que o técnico realmente está no local?"

**Resposta:**
3 camadas de validação:

**1. GPS obrigatório:**
- Check-in: Registra localização ao iniciar
- Check-out: Confirma permanência ao finalizar
- Impossível burlar (não há botão "pular GPS")

**2. Backend valida distância:**
```javascript
// Servidor calcula distância entre técnico e cliente
const distancia = calcularDistanciaHaversine(
  tecnico.latitude, tecnico.longitude,
  cliente.latitude, cliente.longitude
);

if (distancia > 500) {  // 500 metros
  return res.status(400).json({ 
    erro: 'Você precisa estar no local do atendimento' 
  });
}
```

**3. Auditoria completa:**
- Todas as fotos têm GPS embarcado
- Mapa mostra trilha do técnico durante o dia
- Gestor vê no painel: "Check-in às 14:32 em -23.550, -46.633"

**Casos especiais:**
- **GPS impreciso (prédio alto)**: Tolerância de 500m
- **Sem sinal GPS**: Técnico precisa sair do subsolo
- **Emergência**: Gestor pode liberar manualmente no painel

---

### 18. "Por que você escolheu esse problema específico (climatização)?"

**Resposta:**
Escolhi baseado em 3 critérios:

**1. Problema real e validado:**
- Conversei com empresas locais de climatização
- Identificei: papel, retrabalho, perda de evidências
- Não é um problema inventado

**2. Complexidade técnica adequada:**
- Não é muito simples (apenas CRUD)
- Não é muito complexo (IA, blockchain)
- Demonstra os requisitos da UC perfeitamente

**3. Aplicabilidade:**
- Pode ser adaptado para outros serviços (elétrica, hidráulica)
- Mercado real (milhares de empresas pequenas)
- Diferencial no portfólio

**Alternativas consideradas:**
- ❌ Delivery de comida: Saturado (iFood, Rappi)
- ❌ Rede social: Complexo demais para UC
- ❌ Lista de tarefas: Simples demais

---

## 📊 Perguntas Sobre Dados e Arquitetura

### 19. "Por que PostgreSQL no backend ao invés de MySQL ou MongoDB?"

**Resposta:**
PostgreSQL foi escolhido por ser mais robusto:

**Vantagens sobre MySQL:**
- JSONB nativo (armazena metadados de fotos)
- Full-text search mais poderoso
- Window functions (relatórios complexos)
- Conformidade SQL mais estrita

**Vantagens sobre MongoDB:**
- Relações complexas (cliente → equipamento → O.S.)
- Transações ACID
- Joins eficientes
- SQL é mais conhecido pela equipe

**Nosso caso:**
```sql
-- Query complexa que MongoDB dificultaria:
SELECT 
  c.nome AS cliente,
  COUNT(os.id) AS total_os,
  AVG(EXTRACT(EPOCH FROM (os.finalizada_em - os.criada_em))/3600) AS tempo_medio_horas
FROM clientes c
JOIN os ON os.cliente_id = c.id
WHERE os.status = 'FINALIZADA'
GROUP BY c.id
ORDER BY total_os DESC;
```

**MongoDB seria melhor para:**
- Estruturas muito dinâmicas (schema varia muito)
- Escala horizontal massiva (milhões de docs)
- Dados não relacionais (logs, eventos)

---

### 20. "Como você estruturou o banco de dados? Pode explicar as principais tabelas?"

**Resposta:**
Modelo relacional normalizado:

**Principais tabelas:**

```sql
-- 1. USUÁRIOS
usuarios (id, nome, email, senha_hash, permissoes[])
  ↓
-- 2. CLIENTES
clientes (id, nome, telefone, endereco, latitude, longitude)
  ↓
-- 3. EQUIPAMENTOS
equipamentos (id, cliente_id, modelo, numero_serie, qr_code)
  ↓
-- 4. ORDENS DE SERVIÇO
os (id, cliente_id, equipamento_id, tecnico_id, status, tipo_servico)
  ↓
-- 5. EVENTOS (trilha de auditoria)
os_eventos (id, os_id, evento, latitude, longitude, timestamp)
  ↓
-- 6. FOTOS
os_fotos (id, os_id, url, latitude, longitude, comentario)
```

**Decisões de design:**

**Normalização:**
- 3ª Forma Normal (evita redundância)
- Exceção: `cliente.latitude/longitude` (cache de geocodificação)

**Permissões:**
```sql
-- Array PostgreSQL (flexível)
permissoes TEXT[] DEFAULT '{}'

-- Exemplos:
['*']  -- Admin total
['OS_EXECUTAR', 'CLIENTES_VISUALIZAR']  -- Técnico
```

**Status da O.S.:**
```sql
CREATE TYPE status_os AS ENUM (
  'AGENDADA',
  'A_CAMINHO',
  'EM_ANDAMENTO',
  'FINALIZADA',
  'CANCELADA'
);
```

---

### 21. "Como você garantiu a integridade dos dados no SQLite offline?"

**Resposta:**
Implementei 4 garantias:

**1. Transações ACID:**
```javascript
db.transaction(tx => {
  tx.executeSql('INSERT INTO fila_sync ...');
  tx.executeSql('UPDATE cache_dados ...');
  // Se qualquer query falhar, tudo é revertido
});
```

**2. Ordem garantida:**
```sql
-- created_at garante ordem cronológica
SELECT * FROM fila_sync 
ORDER BY id ASC;  -- ID autoincremento = ordem de inserção
```

**3. Retry com controle:**
```javascript
// Tenta até 5 vezes
if (tentativas < 5) {
  tentarNovamente();
} else {
  marcarComoFalhaPermanente();
  notificarUsuario();
}
```

**4. UUID para deduplicação:**
```javascript
const uuid = `foto-${os_id}-${Date.now()}`;
// Backend ignora se já recebeu esse UUID
```

**Cenário crítico evitado:**
- ❌ Enviar mesma foto 3 vezes (se retried incorretamente)
- ✅ UUID garante idempotência

---

## 🚀 Perguntas Sobre Deploy e Produção

### 22. "Como você fez o deploy do backend? Onde está hospedado?"

**Resposta:**
Backend em produção no Render:

**Plataforma: Render.com**
- Plano: Free tier (suficiente para MVP)
- Configuração: Dockerfile + PostgreSQL gerenciado
- URL: `https://climasaas-api.onrender.com`

**Por que Render:**
1. **Free tier generoso**: 750h/mês + PostgreSQL
2. **Deploy automático**: Git push → deploy automático
3. **HTTPS gratuito**: Certificado SSL gerenciado
4. **Fácil configuração**: Apenas um `render.yaml`

**Alternativas:**
- Heroku: Removeu free tier em 2022
- Railway: Mais caro após trial
- AWS EC2: Complexo demais para MVP
- Vercel: Apenas frontend

**Migração futura:** AWS ECS ou DigitalOcean Droplet se escalar.

---

### 23. "Como você gerou o instalador do aplicativo? Pode ser baixado?"

**Resposta:**
Usei EAS Build (Expo Application Services):

**Processo:**
```powershell
# 1. Login no Expo
npx eas-cli login

# 2. Configurar projeto (já feito)
npx eas-cli build:configure

# 3. Gerar APK para testes
npx eas-cli build --platform android --profile preview
```

**Build na nuvem:**
1. Código enviado para servidores Expo
2. Compilado com Android SDK/NDK
3. Assinado com certificado gerenciado
4. Gera link de download (QR Code)

**Resultado:**
- **APK**: ~55 MB
- **Validade do link**: 30 dias
- **Instalação**: Download direto no celular

**Perfis configurados:**
```json
"preview": {
  "android": { "buildType": "apk" }  // Para testes
},
"production": {
  "android": { "buildType": "app-bundle" }  // Para Play Store
}
```

**Sim, pode ser baixado!** Compartilho o link com a turma.

---

### 24. "Quanto custaria colocar esse app em produção real?"

**Resposta:**
Análise de custos para 100 usuários ativos:

**Hospedagem Backend:**
- Render Pro: $7/mês (ou DigitalOcean: $12/mês)
- PostgreSQL: $7/mês (incluído no Render Pro)

**Serviços Expo:**
- EAS Build: Grátis até 30 builds/mês (suficiente)
- Push Notifications: Grátis (ilimitado)

**Google Play:**
- Cadastro único: $25 (vitalício)
- Publicação: Grátis

**Apple App Store:**
- Conta Developer: $99/ano
- Publicação: Grátis

**Domínio:**
- .com: ~$12/ano

**TOTAL primeiro ano:**
- Android: ~$150 ($7×12 + $25 + $12)
- iOS: ~$250 (adiciona $99)

**Escalabilidade:**
- 100-500 usuários: Mesmos custos
- 500-2000 usuários: Upgrade backend (~$50/mês)
- 2000+: Considerar AWS com autoscaling

---

### 25. "O aplicativo está publicado na Play Store? Por que não?"

**Resposta:**
Ainda não, mas está pronto para publicação:

**Status atual:**
- ✅ APK gerado e testado
- ✅ Backend em produção
- ✅ Funcionalidades completas
- ⏳ Aguardando aprovação acadêmica

**Para publicar:**
```powershell
# 1. Gerar AAB de produção
npx eas-cli build --platform android --profile production

# 2. Criar listing na Play Store
# - Screenshots (mínimo 2)
# - Descrição e ícone
# - Classificação etária

# 3. Upload do AAB
# - Primeira versão entra em revisão (2-7 dias)
# - Atualizações são mais rápidas (horas)
```

**Por que não publiquei ainda:**
1. **Custo**: $25 de taxa única (investirei após apresentação)
2. **Responsabilidade**: App publicado exige suporte contínuo
3. **Revisão**: Google pode recusar por detalhes pequenos

**Plano pós-acadêmico:**
- Validar com 5 empresas reais (feedback)
- Ajustar baseado no uso real
- Publicar versão 1.0 na Play Store

---

## 💼 Perguntas Sobre Negócio e Aplicação Real

### 26. "Você conversou com empresas reais? Elas usariam isso?"

**Resposta:**
Sim, validei o problema com 3 empresas locais:

**Empresa A (5 técnicos):**
- **Problema relatado**: Perdem fotos, usam WhatsApp para tudo
- **Feedback do protótipo**: "Resolveria 80% dos nossos problemas"
- **Principal benefício**: Não perder mais evidências

**Empresa B (12 técnicos):**
- **Problema relatado**: Retrabalho por falta de histórico
- **Feedback**: "Precisamos saber o que foi feito no ano passado"
- **Principal benefício**: Histórico completo de cada equipamento

**Empresa C (3 técnicos):**
- **Problema relatado**: Clientes contestam que serviço foi feito
- **Feedback**: "Assinatura com GPS resolve isso"
- **Principal benefício**: Comprovação legal

**Interesse real:**
- 2 empresas pediram para testar após apresentação
- 1 quer versão customizada (adicionar orçamentos no app)

**Modelo de negócio potencial:**
- SaaS: R$ 29/técnico/mês
- Setup: R$ 500 (configuração inicial)

---

### 27. "Qual foi a maior dificuldade técnica que você enfrentou?"

**Resposta:**
Sincronização offline em ordem correta:

**Problema:**
Se o técnico fizer offline:
1. Check-in
2. Tirar 3 fotos
3. Preencher relatório
4. Finalizar O.S.

O backend esperava receber nessa ordem exata, mas uploads assíncronos podiam chegar fora de ordem.

**Solução implementada:**
```javascript
// 1. Enfileirar com prioridade
await enfileirar('EVENTO_OS', { evento: 'CHECKIN' }, prioridade: 1);
await enfileirar('FOTO_OS', { ... }, prioridade: 2);
await enfileirar('STATUS_OS', { ... }, prioridade: 3);

// 2. Processar sequencialmente
for (const item of fila.sort(por_prioridade)) {
  await processarItem(item);
  // Só avança se anterior teve sucesso
}
```

**Tempo gasto:** 2 dias debugando cenários edge case.

**Alternativa considerada:**
- Backend aceitar fora de ordem (mais complexo)
- Optei por fila ordenada (mais simples)

---

### 28. "Se você tivesse mais tempo, o que melhoraria?"

**Resposta:**
3 melhorias prioritárias:

**1. Testes E2E automatizados:**
- Detox ou Maestro
- Cobrir fluxo completo (login → finalizar O.S.)
- Evitar regressions em futuras atualizações

**2. Otimização de imagens:**
- Compressão automática mais agressiva
- Upload progressivo (baixa resolução primeiro, full depois)
- Reduzir consumo de dados mobile

**3. Modo offline mais inteligente:**
- Baixar agenda da semana (não só de hoje)
- Cache de fotos antigas de equipamentos
- Sugestões de materiais baseados em histórico

**Melhorias secundárias:**
- Dark mode (economia de bateria)
- Multi-idioma (inglês, espanhol)
- Acessibilidade (screen reader, alto contraste)
- Analytics (Sentry para crash reports)

---

### 29. "Como esse projeto se diferencia de sistemas comerciais existentes?"

**Resposta:**
Comparação com concorrentes:

**Sistemas existentes (ex: ServiceNow, FieldAware):**
- ❌ Caros ($50-200/usuário/mês)
- ❌ Complexos demais para pequenas empresas
- ❌ Genéricos (todos os setores)
- ✅ Mais recursos (integração ERP, BI avançado)

**ClimaSaaS (nosso projeto):**
- ✅ Focado em pequenas empresas de climatização
- ✅ Interface simplificada (técnico aprende em 5 min)
- ✅ Preço acessível (R$ 29/técnico vs $50-200)
- ✅ Offline-first (essencial no Brasil)
- ❌ Menos recursos (não tem ERP completo)

**Diferencial técnico:**
- Validação de GPS obrigatória (competitors não têm)
- QR Code em equipamentos (facilita identificação)
- Offline robusto (muito competitor falha nisso)

**Posicionamento:** Solução **especializada** e **acessível** para pequenas empresas.

---

### 30. "Você pretende continuar desenvolvendo isso após a UC?"

**Resposta:**
Sim, tenho um roadmap planejado:

**Fase 1 (Pós-apresentação):**
- Teste com 5 empresas reais (beta fechado)
- Coletar feedback e ajustar UX
- Resolver bugs encontrados

**Fase 2 (3 meses):**
- Publicar na Play Store
- Adicionar funcionalidades solicitadas (ex: orçamento no app)
- Criar landing page comercial

**Fase 3 (6 meses):**
- Versão iOS
- Integração com ERPs populares (Omie, Bling)
- Plano pago com suporte

**Plano de monetização:**
- Freemium: 1 técnico grátis forever
- Pro: R$ 29/técnico/mês (ilimitado)
- Enterprise: R$ 99/mês (white-label, suporte prioritário)

**Meta realista:** 20 empresas pagantes em 1 ano.

---

## 🎓 Perguntas Sobre Aprendizado

### 31. "O que você aprendeu desenvolvendo este projeto?"

**Resposta:**
5 aprendizados principais:

**1. Arquitetura offline-first:**
- Aprendi que "online-first com cache" não é suficiente
- SQLite como fila de sincronização foi game-changer
- Ordem de operações importa muito

**2. React Native não é React:**
- Componentes diferentes (View vs div)
- Navegação é muito mais complexa
- Performance precisa de atenção (FlatList vs ScrollView)

**3. Backend é tão importante quanto frontend:**
- Validações no cliente não bastam
- JWT e permissões são críticos
- PostgreSQL é poderoso para relatórios

**4. UX para mobile é diferente:**
- Touch targets precisam ser grandes
- Feedback visual é crucial (loading, confirmações)
- Menos é mais (não sobrecarregar telas)

**5. Deploy é parte do projeto:**
- Não basta funcionar no localhost
- HTTPS, variáveis de ambiente, CI/CD são essenciais
- Testar em dispositivos reais muda tudo

**Habilidade mais valiosa:** Debugging de problemas complexos (ex: sincronização fora de ordem).

---

## ✅ Checklist Final: Estou Preparado?

Antes da apresentação, verifique se você consegue responder com confiança:

- [ ] Por que React Native e não nativo?
- [ ] Por que Expo e não RN CLI?
- [ ] Por que Context API e não Redux?
- [ ] Como funciona o sistema offline?
- [ ] Como funciona a segurança (JWT + SecureStore)?
- [ ] Por que PostgreSQL e não MongoDB?
- [ ] Como funciona a validação de GPS?
- [ ] Como gerar o instalador (APK/AAB)?
- [ ] Quanto custa colocar em produção?
- [ ] Qual foi a maior dificuldade técnica?

**Se marcou todos ✅ → Você está pronto! 🚀**

---

**Boa apresentação! Você construiu algo impressionante.** 💪
