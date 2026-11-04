const test=require('node:test');
const assert=require('node:assert/strict');
const db=require('../src/config/database');
const OsModel=require('../src/models/OsModel');
const Foto=require('../src/controllers/FotoController');
const {nomeAssinanteSchema}=require('../src/validators/assinaturaValidator');
const {distancia,limitar}=require('../mobile/src/components/galeriaTransform');

test('nome de assinatura normaliza espaços e rejeita dados inválidos',()=>{
  assert.equal(nomeAssinanteSchema.parse('  Ana   Souza '),'Ana Souza');
  for(const valor of ['', '  ', 'Ab', 'a'.repeat(151), 123, 'Ana\0Souza'])assert.equal(nomeAssinanteSchema.safeParse(valor).success,false);
});

test('assinatura armazena nome e reenvio consulta somente a mesma OS',async()=>{
  const query=db.query,buscar=OsModel.buscarPorId;let modo='novo';
  OsModel.buscarPorId=async()=>({id:5,empresa_id:3,tecnico_id:7,status:modo==='novo'?'EM_ANDAMENTO':'FINALIZADA'});
  db.query=async(sql,args)=>{
    if(sql.includes('client_uuid=$1')){assert.deepEqual(args,['uuid-assinatura-123',5]);return {rows:modo==='novo'?[]:[{id:8,tipo:'ASSINATURA',assinante_nome:'Ana Souza'}]};}
    if(sql.includes("tipo='DEPOIS'"))return {rows:[{id:1}]};
    if(sql.includes('INSERT INTO os_fotos')){assert.ok(sql.includes('assinante_nome'));assert.equal(args[11],'Ana Souza');return {rows:[{id:8,assinante_nome:args[11]}]};}
    throw new Error(sql);
  };
  const req={file:{mimetype:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])},body:{os_id:'5',tipo:'ASSINATURA',assinante_nome:' Ana  Souza ',client_uuid:'uuid-assinatura-123'},usuarioLogado:{empresa_id:3,usuario_id:7,perfil:'TECNICO'},protocol:'http',get:()=> 'localhost:3000'};
  const resposta=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
  try{
    const nova=resposta();await Foto.upload(req,nova);assert.equal(nova.statusCode,201);assert.equal(nova.body.foto.assinante_nome,'Ana Souza');
    modo='repetido';const repetida=resposta();await Foto.upload(req,repetida);assert.equal(repetida.statusCode,200);
    const conflito=resposta();await Foto.upload({...req,body:{...req.body,assinante_nome:'Outro Nome'}},conflito);assert.equal(conflito.statusCode,409);
  }finally{db.query=query;OsModel.buscarPorId=buscar;}
});

test('PDF inclui o nome do responsável junto da assinatura',async()=>{
  const PDFDocument=require('pdfkit'),PdfService=require('../src/services/PdfService');
  const original=PDFDocument.prototype.text;const textos=[];
  PDFDocument.prototype.text=function(texto,...args){textos.push(texto);return original.call(this,texto,...args);};
  try{
    const pdf=await PdfService.gerarOsPdf({id:5,empresa_nome:'Empresa',tecnico_nome:'Técnico',cliente_nome:'Cliente',finalizado_em:'2026-10-29T12:00:00Z'},[{tipo:'ASSINATURA',assinante_nome:'Ana Souza',conteudo:Buffer.from('imagem indisponível')}]);
    assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.ok(textos.includes('Responsável: Ana Souza'));
  }finally{PDFDocument.prototype.text=original;}
});

test('zoom limita escala e deslocamento conforme proporção da imagem',()=>{
  assert.equal(distancia([{pageX:0,pageY:0},{pageX:3,pageY:4}]),5);
  assert.equal(distancia([]),0);
  assert.deepEqual(limitar({scale:2,x:1000,y:1000},{width:200,height:200},{width:100,height:200}),{scale:2,x:0,y:100});
  assert.deepEqual(limitar({scale:0,x:100,y:100},{width:200,height:200},{width:400,height:200}),{scale:1,x:0,y:0});
  assert.equal(limitar({scale:20,x:0,y:0},{width:200,height:200},{width:100,height:100}).scale,5);
  assert.deepEqual(limitar({scale:NaN,x:Infinity,y:NaN},{width:200,height:200},{width:100,height:100}),{scale:1,x:0,y:0});
});
