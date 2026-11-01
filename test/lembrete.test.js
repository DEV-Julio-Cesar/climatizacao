const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const WhatsAppService = require('../src/services/WhatsAppService');

test('lembrete usa template aprovado com dados do agendamento', async () => {
  const originalPost = axios.post;
  const originalTemplate = process.env.WHATSAPP_TEMPLATE_LEMBRETE;
  process.env.WHATSAPP_TEMPLATE_LEMBRETE = 'lembrete_teste';
  let payload;
  axios.post = async (_url, body) => { payload = body; return { data: { messages: [{ id: 'wamid.1' }] } }; };
  try {
    const resposta = await WhatsAppService.enviarLembreteAgendamento('11999998888', {
      cliente: 'Ana', ordem: 42, agendamento: '2026-11-03T13:30:00.000Z', tecnico: 'Carlos',
    });
    assert.equal(resposta.messages[0].id, 'wamid.1');
    assert.equal(payload.type, 'template');
    assert.equal(payload.template.name, 'lembrete_teste');
    assert.equal(payload.template.components[0].parameters[0].text, 'Ana');
    assert.equal(payload.template.components[0].parameters[1].text, '42');
    assert.equal(payload.to, '5511999998888');
  } finally {
    axios.post = originalPost;
    if (originalTemplate === undefined) delete process.env.WHATSAPP_TEMPLATE_LEMBRETE;
    else process.env.WHATSAPP_TEMPLATE_LEMBRETE = originalTemplate;
  }
});
