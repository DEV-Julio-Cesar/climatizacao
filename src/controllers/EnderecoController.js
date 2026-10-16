const axios = require('axios');

class EnderecoController {
  async buscarCep(req, res) {
    const cep = String(req.params.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ erro: 'Informe um CEP válido com 8 números.' });
    try {
      let endereco;
      try {
        const { data } = await axios.get(`https://brasilapi.com.br/api/cep/v2/${cep}`, { timeout: 7000 });
        endereco = { cep, endereco: data.street || '', bairro: data.neighborhood || '', cidade: data.city || '', estado: data.state || '', latitude: Number(data.location?.coordinates?.latitude) || null, longitude: Number(data.location?.coordinates?.longitude) || null };
      } catch {
        const { data } = await axios.get(`https://viacep.com.br/ws/${cep}/json/`, { timeout: 7000 });
        if (data.erro) return res.status(404).json({ erro: 'CEP não encontrado.' });
        endereco = { cep, endereco: data.logradouro || '', bairro: data.bairro || '', cidade: data.localidade || '', estado: data.uf || '', latitude: null, longitude: null };
      }
      if (endereco.latitude === null || endereco.longitude === null) {
        const consulta = [endereco.endereco, endereco.bairro, endereco.cidade, endereco.estado, 'Brasil'].filter(Boolean).join(', ');
        try {
          const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
            timeout: 7000, params: { q: consulta, format: 'jsonv2', limit: 1, countrycodes: 'br' },
            headers: { 'User-Agent': 'ClimaSaaS/1.0 (consulta de endereco do cliente)' },
          });
          if (data[0]) { endereco.latitude = Number(data[0].lat); endereco.longitude = Number(data[0].lon); }
        } catch { /* o endereço continua utilizável mesmo sem coordenadas */ }
      }
      return res.json(endereco);
    } catch {
      return res.status(502).json({ erro: 'Não foi possível consultar o CEP agora. Confira os dados e tente novamente.' });
    }
  }
}

module.exports = new EnderecoController();
