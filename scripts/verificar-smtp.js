require('dotenv').config();
require('../src/services/EmailService').verificar()
  .then(()=>console.log('Conexão SMTP e autenticação aprovadas. Nenhum e-mail foi enviado.'))
  .catch(error=>{console.error('Falha ao verificar SMTP:',error.code||'SMTP_ERROR');process.exitCode=1;});
