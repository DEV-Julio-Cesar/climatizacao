import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://sua-api.com.br'; // No teste local será o IP da sua máquina

export const api = {
  // Chamada de Login
  login: async (email, senha) => {
    const resposta = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro);
    
    return dados;
  },

  // Chamada autenticada genérica (usada para criar OS, buscar lista, etc.)
  chamadaAutenticada: async (endpoint, metodo = 'GET', body = null) => {
    // Busca o token que foi salvo no aparelho
    const token = await AsyncStorage.getItem('@ClimaSaaS:token');
    
    if (!token) throw new Error('Usuário não autenticado');

    const config = {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Aqui o Token viaja para a API
      }
    };

    if (body) config.body = JSON.stringify(body);

    const resposta = await fetch(`${BASE_URL}${endpoint}`, config);
    const dados = await resposta.json();
    
    if (!resposta.ok) throw new Error(dados.erro || 'Erro na requisição');
    
    return dados;
  }
};