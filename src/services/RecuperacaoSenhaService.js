const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const db=require('../config/database');
const Email=require('./EmailService');
const falha=()=>Object.assign(new Error('Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.'),{status:400});
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
function chaveEmail(){
  const segredo=process.env.EMAIL_QUEUE_SECRET||process.env.JWT_SECRET;
  if(!segredo)throw new Error('Segredo de envio não configurado.');
  return crypto.createHash('sha256').update(`climasaas:email:${segredo}`).digest();
}
function cifrar(dados){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',chaveEmail(),iv);
  const conteudo=Buffer.concat([cipher.update(JSON.stringify(dados),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),conteudo].map(v=>v.toString('base64')).join('.');
}
function decifrar(valor){
  const [iv,tag,conteudo]=valor.split('.').map(v=>Buffer.from(v,'base64'));
  const cipher=crypto.createDecipheriv('aes-256-gcm',chaveEmail(),iv);cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(conteudo),cipher.final()]).toString('utf8'));
}
function linkRecuperacao(token){
  const base=process.env.PASSWORD_RESET_URL || `${String(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,'')}/painel/`;
  const url=new URL(base);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(process.env.NODE_ENV==='production'&&url.protocol!=='https:'))throw new Error('URL pública de recuperação inválida.');
  url.search='';url.hash=`redefinir-senha?token=${token}`;
  return url.toString();
}
function configurado(){try{linkRecuperacao('teste');chaveEmail();return Email.configurado();}catch{return false;}}
async function solicitar(email,executor=db){
  return executor.transaction(async client=>{
    const consulta=await client.query(`SELECT u.id,u.empresa_id,u.email,u.nome FROM usuarios u JOIN empresas e ON e.id=u.empresa_id
      WHERE LOWER(u.email)=LOWER($1) AND u.ativo=TRUE AND u.deleted_at IS NULL AND e.ativo=TRUE AND e.deleted_at IS NULL FOR UPDATE OF u`,[email]);
    const usuario=consulta.rows[0];if(!usuario)return;
    const contagem=await client.query("SELECT COUNT(*)::int total FROM recuperacoes_senha WHERE usuario_id=$1 AND created_at>NOW()-INTERVAL '15 minutes'",[usuario.id]);
    if(contagem.rows[0].total>=3)return;
    const token=crypto.randomBytes(32).toString('base64url'),id=crypto.randomUUID();
    await client.query('UPDATE recuperacoes_senha SET usado_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND usado_em IS NULL',[usuario.id,usuario.empresa_id]);
    const criada=await client.query("INSERT INTO recuperacoes_senha(id,usuario_id,empresa_id,token_hash,expira_em) VALUES($1,$2,$3,$4,NOW()+INTERVAL '15 minutes') RETURNING expira_em",[id,usuario.id,usuario.empresa_id,hash(token)]);
    const expira=new Date(criada.rows[0].expira_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
    const mensagem={to:usuario.email,subject:'Redefina sua senha — ClimaSaaS',text:`Olá, ${usuario.nome}.\n\nUse o link para redefinir sua senha:\n${linkRecuperacao(token)}\n\nEle é de uso único e expira em ${expira} (horário de Brasília), no máximo 15 minutos após a solicitação. Um novo pedido invalida o anterior.\n\nSe você não fez este pedido, ignore esta mensagem. Sua senha não foi alterada.`};
    await client.query('INSERT INTO emails_recuperacao(id,conteudo_cifrado) VALUES($1,$2)',[id,cifrar(mensagem)]);
  });
}
async function redefinir(token,novaSenha,executor=db){
  const tokenHash=hash(token);
  const senhaHash=await bcrypt.hash(novaSenha,12);
  return executor.transaction(async client=>{
    const consulta=await client.query('SELECT usuario_id,empresa_id FROM recuperacoes_senha WHERE token_hash=$1',[tokenHash]);
    const pedido=consulta.rows[0];if(!pedido)throw falha();
    const usuario=await client.query(`SELECT u.id FROM usuarios u JOIN empresas e ON e.id=u.empresa_id WHERE u.id=$1 AND u.empresa_id=$2
      AND u.ativo=TRUE AND u.deleted_at IS NULL AND e.ativo=TRUE AND e.deleted_at IS NULL FOR UPDATE OF u`,[pedido.usuario_id,pedido.empresa_id]);
    if(!usuario.rows.length)throw falha();
    const consumido=await client.query('UPDATE recuperacoes_senha SET usado_em=NOW() WHERE token_hash=$1 AND usuario_id=$2 AND empresa_id=$3 AND usado_em IS NULL AND expira_em>NOW() RETURNING id',[tokenHash,pedido.usuario_id,pedido.empresa_id]);
    if(!consumido.rows.length)throw falha();
    await client.query('UPDATE usuarios SET senha_hash=$1,senha_alterada_em=NOW() WHERE id=$2 AND empresa_id=$3',[senhaHash,pedido.usuario_id,pedido.empresa_id]);
    await client.query('UPDATE sessoes SET revogada_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND revogada_em IS NULL',[pedido.usuario_id,pedido.empresa_id]);
    await client.query('UPDATE recuperacoes_senha SET usado_em=NOW() WHERE usuario_id=$1 AND empresa_id=$2 AND usado_em IS NULL',[pedido.usuario_id,pedido.empresa_id]);
    await client.query("UPDATE emails_recuperacao SET concluido_em=NOW(),conteudo_cifrado='' WHERE id IN(SELECT id FROM recuperacoes_senha WHERE usuario_id=$1 AND empresa_id=$2)",[pedido.usuario_id,pedido.empresa_id]);
  });
}
module.exports={solicitar,redefinir,configurado,linkRecuperacao,cifrar,decifrar,hash};
