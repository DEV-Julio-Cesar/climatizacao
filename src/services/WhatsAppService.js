const db = require('../config/database');
const logger = require('../config/logger');
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

  async contexto(empresaId) {
    if(!Number.isInteger(Number(empresaId)) || !empresaId)throw new Error('Empresa do envio nao informada.');
    const r=await db.query(`SELECT n.phone_number_id FROM whatsapp_numeros n JOIN empresas e ON e.id=n.empresa_id WHERE n.empresa_id=$1 AND e.ativo=TRUE AND e.deleted_at IS NULL ORDER BY n.phone_number_id LIMIT 2`,[empresaId]);
    if(r.rows.length!==1)throw new Error('Configure um unico numero WhatsApp para esta empresa.');
    const phoneNumberId=r.rows[0].phone_number_id;
    return {phoneNumberId,apiUrl:`https://graph.facebook.com/${this.graphVersion}/${phoneNumberId}/messages`};
  }
  // Envia uma mensagem de texto simples
  async enviarMensagem(telefone, mensagem, empresaId) {
    const context=await this.contexto(empresaId);
    const payload = {
      messaging_product: 'whatsapp',
      to:                this._formatarNumero(telefone),
      type:              'text',
      text: { body: mensagem },
    };

    try {
      const response = await axios.post(context.apiUrl, payload, { headers: this.headers });
      return response.data;
    } catch (error) {
      logger.erro('whatsapp.envio_falhou',{status:error.response?.status});
      const detalhe = error.response?.data?.error?.message;
      throw new Error(detalhe || 'Falha ao enviar mensagem pela Meta.');
    }
  }

  // Envia um PDF via link público usando um template aprovado
  // O template 'os_finalizada' deve ter:
  //   - Header: tipo DOCUMENT (variável)
  //   - Body: variável {{1}} com o nome do cliente
  async enviarPdfOs(telefone, nomeCliente, urlPdf, empresaId) {
    const context=await this.contexto(empresaId);
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
      const response = await axios.post(context.apiUrl, payload, { headers: this.headers });
      return response.data;
    } catch (error) {
      // Falha silenciosa: não derruba a API principal se o WhatsApp cair
      logger.erro('whatsapp.envio_falhou',{status:error.response?.status});
    }
  }

  // Formata o número para o padrão internacional sem '+' (ex: 5511999998888)
  async enviarLembreteAgendamento(telefone, dados, empresaId) {
    const context=await this.contexto(empresaId);
    const instante = new Date(dados.agendamento);
    const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(instante);
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(instante);
    const payload = {
      messaging_product: 'whatsapp', to: this._formatarNumero(telefone), type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE_LEMBRETE || 'lembrete_agendamento',
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR' },
        components: [{ type: 'body', parameters: [dados.cliente, String(dados.ordem), data, hora, dados.tecnico].map((text) => ({ type: 'text', text })) }],
      },
    };
    try { return (await axios.post(context.apiUrl, payload, { headers: this.headers })).data; }
    catch (error) { throw new Error(error.response?.data?.error?.message || 'A Meta recusou o template de lembrete.'); }
  }

  _formatarNumero(telefone) {
    let apenasDigitos = String(telefone || '').replace(/\D/g, '');
    if (!apenasDigitos.startsWith('55')) apenasDigitos = `55${apenasDigitos}`;
    // Alguns webhooks da Meta ainda entregam números móveis brasileiros sem o nono dígito.
    if (apenasDigitos.length === 12 && apenasDigitos.startsWith('55')) {
      apenasDigitos = `${apenasDigitos.slice(0, 4)}9${apenasDigitos.slice(4)}`;
    }
    return apenasDigitos;
  }

  async enviarDocumento(telefone, buffer, filename, caption, empresaId) {
    const context=await this.contexto(empresaId);
    if (!this.configurado()) throw new Error('Integração do WhatsApp não configurada.');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');
    form.append('file', new Blob([buffer], { type:'application/pdf' }), filename);
    try {
      const upload=await axios.post(`https://graph.facebook.com/${this.graphVersion}/${context.phoneNumberId}/media`,form,{headers:{Authorization:`Bearer ${this.token}`}});
      const payload={messaging_product:'whatsapp',to:this._formatarNumero(telefone),type:'document',document:{id:upload.data.id,filename,caption}};
      return (await axios.post(context.apiUrl,payload,{headers:this.headers})).data;
    } catch(error) {
      const detalhe=error.response?.data?.error?.message;
      throw new Error(detalhe||'A Meta recusou o envio. Verifique a janela de 24 horas e o telefone do cliente.');
    }
  }
}

module.exports = new WhatsAppService();
