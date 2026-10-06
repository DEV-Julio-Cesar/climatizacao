// =============================================================
// SCRIPT DE TESTE — Meta WhatsApp Cloud API
// Rode no terminal com: node src/webhooks/teste-webhook.js
// =============================================================

require('dotenv').config(); // Carrega o .env da raiz do projeto

const axios = require('axios');

// --- Credenciais lidas do .env ---
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; // 1350393031495035
const TOKEN           = process.env.WHATSAPP_ACCESS_TOKEN;
const API_URL         = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type':  'application/json',
};

// ⚠️  IMPORTANTE: a Meta só permite enviar mensagens de teste para números
// que foram adicionados manualmente no painel como "números de teste".
//
// WHATSAPP_TEST_SENDER (+1 555 646-5870) → número de onde a Meta ENVIA (remetente sandbox)
// WHATSAPP_TEST_RECIPIENT                → SEU número que vai RECEBER (cadastrado no painel)
//
// Para cadastrar seu número: Meta for Developers → WhatsApp → API Setup
//   → "To" → "Manage phone number list" → adicione seu número → confirme o OTP
const NUMERO_DESTINO = process.env.WHATSAPP_TEST_RECIPIENT || 'SEU_NUMERO_AQUI';

// =============================================================
// TESTE 1: Mensagem de texto simples (FREE-FORM)
// Só funciona dentro de uma janela de 24h após o usuário ter
// enviado uma mensagem para o número de teste da Meta.
// =============================================================
async function testarTexto() {
  console.log('\n📱 TESTE 1 — Mensagem de texto simples...');

  const payload = {
    messaging_product: 'whatsapp',
    to:                NUMERO_DESTINO,
    type:              'text',
    text: {
      body: '✅ Olá! Este é um teste do sistema de O.S. de Climatização. API funcionando!',
    },
  };

  try {
    const res = await axios.post(API_URL, payload, { headers: HEADERS });
    console.log('✅ Sucesso:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('❌ Erro:', JSON.stringify(err.response?.data || err.message, null, 2));
  }
}

// =============================================================
// TESTE 2: Template "hello_world" (pré-aprovado pela Meta)
// Este template já vem disponível em todas as contas de teste.
// Use-o para confirmar que o token e o Phone Number ID estão certos.
// =============================================================
async function testarTemplateHelloWorld() {
  console.log('\n� TESTE 2 — Template hello_world (pré-aprovado pela Meta)...');

  const payload = {
    messaging_product: 'whatsapp',
    to:                NUMERO_DESTINO,
    type:              'template',
    template: {
      name:     'hello_world',
      language: { code: 'en_US' }, // Template padrão da Meta está em inglês
    },
  };

  try {
    const res = await axios.post(API_URL, payload, { headers: HEADERS });
    console.log('✅ Sucesso:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('❌ Erro:', JSON.stringify(err.response?.data || err.message, null, 2));
  }
}

// =============================================================
// TESTE 3: Verifica o status da conta e templates disponíveis
// =============================================================
async function verificarTemplates() {
  console.log('\n� TESTE 3 — Listando templates da conta...');

  const BUSINESS_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID; // 2108784909844817
  const url = `https://graph.facebook.com/v20.0/${BUSINESS_ID}/message_templates?fields=name,status,language&limit=10`;

  try {
    const res = await axios.get(url, { headers: HEADERS });
    const templates = res.data?.data || [];
    console.log(`✅ ${templates.length} template(s) encontrado(s):`);
    templates.forEach(t => {
      console.log(`   - ${t.name} [${t.language}] → ${t.status}`);
    });
  } catch (err) {
    console.error('❌ Erro:', JSON.stringify(err.response?.data || err.message, null, 2));
  }
}

// =============================================================
// EXECUÇÃO
// =============================================================
(async () => {
  if (!PHONE_NUMBER_ID || !TOKEN) {
    console.error('❌ WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN não definidos no .env');
    process.exit(1);
  }

  console.log(`🚀 Iniciando testes com Phone Number ID: ${PHONE_NUMBER_ID}`);

  await verificarTemplates();    // Primeiro confirma a conexão e os templates
  await testarTemplateHelloWorld(); // Disparo seguro com template pré-aprovado
  // await testarTexto();          // Descomente se já houver janela de 24h aberta
})();
