const test=require('node:test');const assert=require('node:assert/strict');const jwt=require('jsonwebtoken');const db=require('../src/config/database');const createApp=require('../src/app');
test('master isolado de operacao e admin sem acesso a plataforma',async()=>{
 const old=db.query;let role='MASTER';db.query=async()=>({rows:[{ativo:true,perfil:role,overrides:[],nome:'Teste'}]});const server=createApp().listen(0);
 try{const base=`http://127.0.0.1:${server.address().port}`;const token=jwt.sign({token_use:'access',sid:'teste',usuario_id:1,empresa_id:1},process.env.JWT_SECRET);const headers={Authorization:`Bearer ${token}`};assert.equal((await fetch(base+'/clientes',{headers})).status,403);role='ADMIN';assert.equal((await fetch(base+'/master/empresas',{headers})).status,403);role='MASTER';const r=await fetch(base+'/master/empresas',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({nome:'Empresa',cnpj:'11222333000181',administrador:{nome:'Teste',email:'a@example.test',senha:'Senha12345678'},empresa_id:2})});assert.equal(r.status,400);
 }finally{db.query=old;await new Promise(r=>server.close(r));}
});
