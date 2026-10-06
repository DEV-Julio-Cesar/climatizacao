require('dotenv').config();
const fs = require('fs');
const path = require('path');
const createApp = require('./src/app');

const port = Number(process.env.PORT) || 3000;
fs.mkdirSync(path.resolve(__dirname, 'tmp', 'uploads'), { recursive: true });

const server = createApp().listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

module.exports = server;
