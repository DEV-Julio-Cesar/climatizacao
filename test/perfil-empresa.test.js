const test = require('node:test');
const assert = require('node:assert/strict');
const {validarDocumento,normalizar} = require('../src/validators/documento');
test('valida CPF e CNPJ numérico e alfanumérico',()=>{
 assert.equal(validarDocumento('529.982.247-25','CPF'),true);
 assert.equal(validarDocumento('11.222.333/0001-81','CNPJ'),true);
 assert.equal(validarDocumento('00.000.000/E08G-12','CNPJ'),true);
 for(const n of ['11111111111','00000000000000','52998224724','11.222.333/0001-82','52998224725abc','',null]) assert.equal(validarDocumento(n),false);
 assert.equal(validarDocumento('52998224725','CNPJ'),false);
 assert.equal(normalizar('00.000.000/e08g-12'),'00000000E08G12');
});
const axios=require('axios');
const db=require('../src/config/database');
const conta=require('../src/controllers/ContaController');
function resposta(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(d){this.body=d;return this;}};}
test('CPF nunca declara existência verificada',async()=>{const r=resposta();await conta.consultarDocumento({body:{documento:'52998224725'}},r);assert.equal(r.body.verificado,false);assert.equal(r.body.valido,true);});
test('consulta diferencia ausência e indisponibilidade',async()=>{const original=axios.get;try{for(const status of [404,429]){axios.get=async()=>{throw {response:{status}};};const r=resposta();await conta.consultarDocumento({body:{documento:'11222333000181'}},r);assert.equal(r.statusCode,status===404?404:503);assert.equal(r.body.verificado,false);assert.equal(r.body.valido,true);}}finally{axios.get=original;}});
test('empresa atualizada usa tenant autenticado e exige senha',async()=>{
 const original=db.transaction;const hash=await require('bcryptjs').hash('Senha12345',4);
 try{let params;db.transaction=async fn=>fn({query:async(sql,p)=>{if(sql.startsWith('SELECT senha_hash'))return {rows:[{senha_hash:hash}]};if(sql.startsWith('UPDATE empresas'))params=p;return {rows:[{id:7}]};}});
 const req={body:{nome:'Empresa teste',cnpj:'11222333000181',senha_atual:'Senha12345'},usuarioLogado:{empresa_id:7,usuario_id:1}};
 const r=resposta();await conta.salvarEmpresa(req,r);assert.equal(r.statusCode,200);assert.equal(params.at(-1),7);
 for(const extra of [{empresa_id:8},{senha_atual:undefined},{senha_atual:'errada123'}]){const r=resposta();await conta.salvarEmpresa({...req,body:{...req.body,...extra}},r);assert.equal(r.statusCode,extra.senha_atual==='errada123'?401:400);}
 }finally{db.transaction=original;}
});
