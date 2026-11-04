const {z}=require('zod');
const service=require('../services/RecuperacaoSenhaService');
const logger=require('../config/logger');
const email=z.object({email:z.string().trim().email().max(150).transform(v=>v.toLowerCase())}).strict();
const reset=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),nova_senha:z.string().min(8).max(100).regex(/[A-Za-z]/).regex(/[0-9]/)}).strict();
module.exports={
  async solicitar(req,res){
    res.setHeader('Cache-Control','no-store');
    const entrada=email.safeParse(req.body);if(!entrada.success)return res.status(400).json({erro:'Informe um e-mail válido.'});
    if(!service.configurado())return res.status(503).json({erro:'Recuperação por e-mail indisponível. Contate a gestão.'});
    try{await service.solicitar(entrada.data.email);return res.status(202).json({mensagem:'Se este e-mail estiver cadastrado e ativo, enviaremos um link de recuperação. Confira também o spam.'});}
    catch(error){logger.erro('recuperacao.solicitar',{request_id:req.id,erro_codigo:error.code||'RESET_QUEUE_ERROR'});return res.status(503).json({erro:'Não foi possível processar o pedido. Tente novamente mais tarde.'});}
  },
  async redefinir(req,res){
    res.setHeader('Cache-Control','no-store');
    const entrada=reset.safeParse(req.body);if(!entrada.success)return res.status(400).json({erro:'Link ou senha inválidos. Use 8 a 100 caracteres com letras e números.'});
    try{await service.redefinir(entrada.data.token,entrada.data.nova_senha);res.clearCookie('climasaas_refresh',{path:'/auth/refresh'});return res.json({mensagem:'Senha redefinida. Entre novamente em seus dispositivos.'});}
    catch(error){if(error.status===400)return res.status(400).json({erro:error.message});logger.erro('recuperacao.redefinir',{request_id:req.id,erro_codigo:error.code||'RESET_ERROR'});return res.status(503).json({erro:'Não foi possível redefinir a senha. Tente novamente.'});}
  },
};
