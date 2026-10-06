// Teste do POST /login
// Execute com: node src/webhooks/teste-login.js

require('dotenv').config();
const http = require('http');

const payload = JSON.stringify({
  email: 'admin@climasaas.com',
  senha: '123456'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log('🔐 Testando POST /login...\n');

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const resultado = JSON.parse(data);
    console.log(`Status HTTP: ${res.statusCode}`);
    console.log('Resposta:', JSON.stringify(resultado, null, 2));

    if (res.statusCode === 200 && resultado.token) {
      console.log('\n✅ LOGIN OK — JWT recebido!');
      console.log(`\nToken para copiar:\n${resultado.token}`);
    } else {
      console.log('\n❌ Falha no login:', resultado.erro || 'resposta inesperada');
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Erro de conexão:', e.message);
  console.error('→ O servidor está rodando? Execute: node server.js');
});

req.write(payload);
req.end();
