const nodemailer = require('nodemailer');
function configurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && (process.env.SMTP_FROM || process.env.SMTP_USER));
}
function transporte() {
  if (!configurado()) throw Object.assign(new Error('Envio de e-mail não configurado.'), { code: 'SMTP_NOT_CONFIGURED' });
  const secure=process.env.SMTP_SECURE !== 'false';
  return nodemailer.createTransport({
    host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)|| (secure?465:587),secure,requireTLS:!secure,
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},
    tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
  });
}
async function enviar({to,subject,text}) {
  const smtp=transporte();
  try{return await smtp.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,text,disableFileAccess:true,disableUrlAccess:true});}
  finally{smtp.close();}
}
async function verificar(){const smtp=transporte();try{await smtp.verify();}finally{smtp.close();}}
module.exports={configurado,enviar,verificar};
