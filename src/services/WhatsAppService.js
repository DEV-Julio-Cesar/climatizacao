const axios = require('axios');
const logger = require('../config/logger');

// Integração com a Meta WhatsApp Cloud API
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Variáveis de ambiente necessárias (.env):
//   WHATSAPP_PHONE_NUMBER_ID  → Phone Number ID do painel Meta for Developers
//   WHATSAPP_ACCESS_TOKEN     → Token de acesso (temporário para teste, permanente em produção)

class WhatsAppService {
  constructor(config = {}) {
    this.phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.token         = config.token || process.env.WHATSAPP_ACCESS_TOKEN;
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
    if (!this.configurado()) throw new Error('Integração do WhatsApp não configurada.');
    const payload = {
      messaging_product: 'whatsapp',
      to:                this._formatarNumero(telefone),
      type:              'text',
      text: { body: mensagem },
    };

    try {
      const response = await axios.post(this.apiUrl, payload, { headers: this.headers, timeout: 30_000 });
      return response.data;
    } catch (error) {
      logger.erro('whatsapp.enviar_texto', { erro_codigo: error.response?.data?.error?.code || error.code || 'META_ERROR' });
      throw new Error('Não foi possível confirmar o envio pela Meta.');
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
      const response = await axios.post(this.apiUrl, payload, { headers: this.headers, timeout: 30_000 });
      console.log('✅ PDF enviado via WhatsApp:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Falha ao enviar PDF WhatsApp:', error.response?.data || error.message);
      throw new Error('Falha ao enviar PDF pela Meta.');
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

  async enviarDocumento(telefone, buffer, filename, caption) {
    if (!this.configurado()) throw new Error('Integração do WhatsApp não configurada.');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');
    form.append('file', new Blob([buffer], { type:'application/pdf' }), filename);
    try {
      const upload=await axios.post(`https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/media`,form,{headers:{Authorization:`Bearer ${this.token}`}});
      const payload={messaging_product:'whatsapp',to:this._formatarNumero(telefone),type:'document',document:{id:upload.data.id,filename,caption}};
      return (await axios.post(this.apiUrl,payload,{headers:this.headers})).data;
    } catch(error) {
      const detalhe=error.response?.data?.error?.message;
      throw new Error(detalhe||'A Meta recusou o envio. Verifique a janela de 24 horas e o telefone do cliente.');
    }
  }
}

module.exports = new WhatsAppService();
module.exports.criarCliente = config => new WhatsAppService(config);
