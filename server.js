require('dotenv').config();
const fs = require('fs');
const path = require('path');
const createApp = require('./src/app');

const port = Number(process.env.PORT) || 3000;
fs.mkdirSync(path.resolve(__dirname, 'tmp', 'uploads'), { recursive: true });

const server = createApp().listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
const pararWorker = require('./src/services/DocumentoWorker').iniciar();
server.on('close', pararWorker);
const pararAlertas = require('./src/services/AlertaWorker').iniciar();
server.on('close', pararAlertas);
const pararEmails = require('./src/services/EmailWorker').iniciar();
server.on('close', pararEmails);
const pararWhatsAppBot = require('./src/services/WhatsAppBotWorker').iniciar();
server.on('close', pararWhatsAppBot);
const pararEventos = require('./src/services/EventoService').iniciar();
server.on('close', pararEventos);

module.exports = server;
