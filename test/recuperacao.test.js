const test=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const service=require('../src/services/RecuperacaoSenhaService');
const Email=require('../src/services/EmailService');
const Worker=require('../src/services/EmailWorker');
const db=require('../src/config/database');
process.env.EMAIL_QUEUE_SECRET='segredo-exclusivo-de-email-para-testes';
process.env.PASSWORD_RESET_URL='https://app.example/painel/';

function bancoTeste(){
  let dados={usuario:{id:7,empresa_id:3,email:'ana@example.com',nome:'Ana'},pedidos:[],emails:[],sessoesAtivas:true,senha:null};
  let anterior=Promise.resolve();
  const query=async(sql,args)=>{
    if(sql.includes('LOWER(u.email)'))return {rows:args[0].toLowerCase()===dados.usuario.email?[dados.usuario]:[]};
    if(sql.includes('COUNT(*)'))return {rows:[{total:dados.pedidos.length}]};
    if(sql.startsWith('INSERT INTO recuperacoes_senha')){const p={id:args[0],usuario_id:args[1],empresa_id:args[2],token_hash:args[3],expira_em:new Date(Date.now()+900000),usado_em:null};dados.pedidos.push(p);return {rows:[p]};}
    if(sql.startsWith('INSERT INTO emails_recuperacao')){dados.emails.push({id:args[0],conteudo_cifrado:args[1]});return {rows:[]};}
    if(sql.startsWith('SELECT usuario_id'))return {rows:dados.pedidos.filter(p=>p.token_hash===args[0])};
    if(sql.includes('FROM usuarios u')&&sql.includes('FOR UPDATE'))return {rows:[{id:dados.usuario.id}]};
    if(sql.startsWith('UPDATE recuperacoes_senha')){
      if(sql.includes('WHERE token_hash')){const p=dados.pedidos.find(p=>p.token_hash===args[0]&&!p.usado_em&&p.expira_em>Date.now());if(!p)return {rows:[]};p.usado_em=new Date();return {rows:[{id:p.id}]};}
      dados.pedidos.forEach(p=>{if(!p.usado_em)p.usado_em=new Date();});return {rows:[]};
    }
    if(sql.startsWith('UPDATE usuarios')){dados.senha=args[0];return {rows:[]};}
    if(sql.startsWith('UPDATE sessoes')){dados.sessoesAtivas=false;return {rows:[]};}
    if(sql.startsWith('UPDATE emails_recuperacao')){dados.emails.forEach(e=>e.conteudo_cifrado='');return {rows:[]};}
    throw new Error(sql);
  };
  const executor={transaction:fn=>{const executar=anterior.then(async()=>{const snapshot=structuredClone(dados);try{return await fn({query});}catch(e){dados=snapshot;throw e;}});anterior=executar.catch(()=>{});return executar;}};
  return {executor,get dados(){return dados;}};
}
function tokenDoEmail(banco){const email=service.decifrar(banco.dados.emails.at(-1).conteudo_cifrado);const url=new URL(email.text.match(/https:\/\/\S+/)[0]);return new URLSearchParams(url.hash.split('?')[1]).get('token');}

test('pedido guarda hash, cifra e-mail e não expõe o token na URL ao servidor',async()=>{
  const banco=bancoTeste();await service.solicitar('ana@example.com',banco.executor);
  const token=tokenDoEmail(banco),pedido=banco.dados.pedidos[0];assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.equal(pedido.token_hash,service.hash(token));
  assert.ok(!banco.dados.emails[0].conteudo_cifrado.includes(token));assert.ok(!banco.dados.emails[0].conteudo_cifrado.includes('ana@example.com'));
  assert.ok(Math.abs(pedido.expira_em-Date.now()-900000)<1000);
  const url=new URL(service.linkRecuperacao(token));assert.equal(url.search,'');assert.ok(url.hash.includes(token));
  await service.solicitar('inexistente@example.com',banco.executor);assert.equal(banco.dados.emails.length,1);
});

test('redefinição usa token uma vez, troca senha e revoga sessões em transação',async()=>{
  const banco=bancoTeste();await service.solicitar('ana@example.com',banco.executor);const token=tokenDoEmail(banco);
  const resultados=await Promise.allSettled([service.redefinir(token,'SenhaNova123',banco.executor),service.redefinir(token,'OutraSenha123',banco.executor)]);
  assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultados.find(r=>r.status==='rejected').reason.status,400);
  assert.equal(await bcrypt.compare('SenhaNova123',banco.dados.senha),true);assert.equal(banco.dados.sessoesAtivas,false);assert.equal(banco.dados.emails[0].conteudo_cifrado,'');
});

test('link expirado é rejeitado e novo pedido invalida o anterior',async()=>{
  const banco=bancoTeste();await service.solicitar('ana@example.com',banco.executor);const antigo=tokenDoEmail(banco);
  await service.solicitar('ana@example.com',banco.executor);assert.ok(banco.dados.pedidos[0].usado_em);
  await assert.rejects(service.redefinir(antigo,'SenhaNova123',banco.executor),e=>e.status===400);
  const atual=tokenDoEmail(banco);banco.dados.pedidos[1].expira_em=new Date(Date.now()-1);
  await assert.rejects(service.redefinir(atual,'SenhaNova123',banco.executor),e=>e.status===400);assert.equal(banco.dados.sessoesAtivas,true);
});

test('limite persistente impede mais de três e-mails por janela',async()=>{
  const banco=bancoTeste();for(let i=0;i<5;i++)await service.solicitar('ana@example.com',banco.executor);assert.equal(banco.dados.emails.length,3);
});

test('fila detecta conteúdo cifrado adulterado e worker confirma apenas após SMTP',async()=>{
  const valor=service.cifrar({to:'ana@example.com',subject:'Teste',text:'conteúdo privado'});
  const partes=valor.split('.');partes[1]=Buffer.alloc(16).toString('base64');assert.throws(()=>service.decifrar(partes.join('.')));
  const original=db.query,config=Email.configurado,enviar=Email.enviar;const ordem=[];
  db.query=async(sql)=>{if(sql.includes('r.expira_em<=NOW()'))return {rows:[]};if(sql.includes('RETURNING *')){assert.ok(sql.includes('r.expira_em>NOW()'));return {rows:[{id:'teste',tentativas:1,conteudo_cifrado:valor}]};}ordem.push(sql.includes('concluido_em=NOW()')?'confirmar':'retry');return {rows:[]};};
  Email.configurado=()=>true;Email.enviar=async dados=>{assert.equal(dados.to,'ana@example.com');ordem.push('SMTP');};
  try{await Worker.processar();assert.deepEqual(ordem,['SMTP','confirmar']);}
  finally{db.query=original;Email.configurado=config;Email.enviar=enviar;}
});

test('falha SMTP mantém tentativa pendente sem registrar conteúdo sensível',async()=>{
  const original=db.query,config=Email.configurado,enviar=Email.enviar,logger=require('../src/config/logger'),log=logger.erro;const registros=[];
  const valor=service.cifrar({to:'ana@example.com',subject:'Teste',text:'token-confidencial'});
  db.query=async(sql,args)=>{if(sql.includes('r.expira_em<=NOW()'))return {rows:[]};if(sql.includes('RETURNING *'))return {rows:[{id:'teste',tentativas:1,conteudo_cifrado:valor}]};assert.ok(!sql.includes('concluido_em=NOW()'));assert.equal(args[1],'EAUTH');return {rows:[]};};
  Email.configurado=()=>true;Email.enviar=async()=>{throw Object.assign(new Error('token-confidencial'),{code:'EAUTH'});};logger.erro=(...args)=>registros.push(args);
  try{await Worker.processar();assert.ok(!JSON.stringify(registros).includes('token-confidencial'));assert.ok(JSON.stringify(registros).includes('EAUTH'));}
  finally{db.query=original;Email.configurado=config;Email.enviar=enviar;logger.erro=log;}
});

test('SMTP Gmail usa TLS, autenticação e impede leitura de arquivos ou URLs',async()=>{
  const nodemailer=require('nodemailer'),original=nodemailer.createTransport;
  const chaves=['SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_FROM'],salvos=Object.fromEntries(chaves.map(c=>[c,process.env[c]]));
  Object.assign(process.env,{SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:'teste@gmail.com',SMTP_PASS:'senha-de-app-de-teste',SMTP_FROM:'teste@gmail.com'});
  let fechou=false;
  nodemailer.createTransport=options=>{assert.equal(options.host,'smtp.gmail.com');assert.equal(options.port,465);assert.equal(options.secure,true);assert.equal(options.tls.rejectUnauthorized,true);return {sendMail:async dados=>{assert.equal(dados.disableFileAccess,true);assert.equal(dados.disableUrlAccess,true);assert.equal(dados.from,'teste@gmail.com');},close:()=>{fechou=true;}};};
  try{await Email.enviar({to:'destino@example.com',subject:'Teste',text:'mensagem'});assert.equal(fechou,true);}
  finally{nodemailer.createTransport=original;for(const c of chaves)if(salvos[c]===undefined)delete process.env[c];else process.env[c]=salvos[c];}
});
