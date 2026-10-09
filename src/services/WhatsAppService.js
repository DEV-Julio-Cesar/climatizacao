const axios = require('axios');

// Integração com a Meta WhatsApp Cloud API
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Variáveis de ambiente necessárias (.env):
//   WHATSAPP_PHONE_NUMBER_ID  → Phone Number ID do painel Meta for Developers
//   WHATSAPP_ACCESS_TOKEN     → Token de acesso (temporário para teste, permanente em produção)

class WhatsAppService {
  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.token         = process.env.WHATSAPP_ACCESS_TOKEN;
    this.graphVersion  = process.env.WHATSAPP_GRAPH_VERSION || 'v24.0';
    this.apiUrl        = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
    this.headers       = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type':  'application/json',
    };
  }

  configurado() {
    return Boolean(this.phoneNumberId && this.token && !this.phoneNumberId.startsWith('SEU_') && !this.token.startsWith('SEU_'));
  }

  // Envia uma mensagem de texto simples
  async enviarMensagem(telefone, mensagem) {
    const payload = {
      messaging_product: 'whatsapp',
      to:                this._formatarNumero(telefone),
      type:              'text',
      text: { body: mensagem },
    };

    try {
      const response = await axios.post(this.apiUrl, payload, { headers: this.headers });
      console.log('✅ WhatsApp texto enviado:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Falha ao enviar texto WhatsApp:', error.response?.data || error.message);
      const detalhe = error.response?.data?.error?.message;
      throw new Error(detalhe || 'Falha ao enviar mensagem pela Meta.');
    }
  }

  // Envia um PDF via link público usando um template aprovado
  // O template 'os_finalizada' deve ter:
  //   - Header: tipo DOCUMENT (variável)
  //   - Body: variável {{1}} com o nome do cliente
  async enviarPdfOs(telefone, nomeCliente, urlPdf) {
    const payload = {
      messaging_product: 'whatsapp',
      to:                this._formatarNumero(telefone),
      type:              'template',
      template: {
        name:     'os_finalizada',  // Nome do template aprovado no Meta Business Manager
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'header',
            parameters: [
              {
                type:     'document',
                document: {
                  link:     urlPdf,
                  filename: 'Ordem_de_Servico.pdf',
                },
              },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nomeCliente }, // Substitui {{1}} no corpo do template
            ],
          },
        ],
      },
    };

    try {
      const response = await axios.post(this.apiUrl, payload, { headers: this.headers });
      console.log('✅ PDF enviado via WhatsApp:', response.data);
      return response.data;
    } catch (error) {
      // Falha silenciosa: não derruba a API principal se o WhatsApp cair
      console.error('❌ Falha ao enviar PDF WhatsApp:', error.response?.data || error.message);
    }
  }

  // Formata o número para o padrão internacional sem '+' (ex: 5511999998888)
  _formatarNumero(telefone) {
    let apenasDigitos = String(telefone || '').replace(/\D/g, '');
    if (!apenasDigitos.startsWith('55')) apenasDigitos = `55${apenasDigitos}`;
    // Alguns webhooks da Meta ainda entregam números móveis brasileiros sem o nono dígito.
    if (apenasDigitos.length === 12 && apenasDigitos.startsWith('55')) {
      apenasDigitos = `${apenasDigitos.slice(0, 4)}9${apenasDigitos.slice(4)}`;
    }
    return apenasDigitos;
  }
}

module.exports = new WhatsAppService();
