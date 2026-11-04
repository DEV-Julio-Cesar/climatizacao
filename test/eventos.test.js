const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {criarHub}=require('../src/services/EventoService');
class FakeClient extends EventEmitter{async connect(){}async query(sql){assert.equal(sql,'LISTEN climasaas_eventos');}async end(){this.emit('end');}}
function resposta(){const res=new EventEmitter();Object.assign(res,{statusCode:200,writableLength:0,writableEnded:false,quadros:[],status(n){this.statusCode=n;return this;},set(){return this;},json(body){this.body=body;return this;},flushHeaders(){},write(s){this.quadros.push(s);},end(){this.writableEnded=true;this.emit('close');}});return res;}
const usuario=(empresa_id,usuario_id,permissoes)=>({usuarioLogado:{empresa_id,usuario_id,permissoes}});

test('SSE isola empresa/permissão, remove assinantes e limita conexões',async()=>{
  const hub=criarHub(FakeClient);hub.iniciar();await new Promise(setImmediate);
  const agenda=resposta(),whats=resposta(),outra=resposta(),negada=resposta();
  try{
    hub.stream(usuario(3,7,['AGENDA_VISUALIZAR']),agenda);hub.stream(usuario(3,8,['ATENDIMENTO_VISUALIZAR']),whats);hub.stream(usuario(4,9,['*']),outra);
    hub.stream(usuario(3,10,[]),negada);assert.equal(negada.statusCode,403);
    hub.distribuir({empresa_id:3,tipo:'whatsapp'});assert.equal(agenda.quadros.length,1);assert.equal(whats.quadros.length,2);assert.equal(outra.quadros.length,1);
    assert.ok(!whats.quadros[1].includes('empresa_id'));
    const extras=[];for(let i=0;i<5;i++){const res=resposta();hub.stream(usuario(3,7,['AGENDA_VISUALIZAR']),res);extras.push(res);}
    assert.equal(extras.at(-1).statusCode,429);
    agenda.end();assert.equal(hub.total,6);
  }finally{hub.parar();assert.equal(hub.total,0);}
});

test('parser SSE aceita fragmentação, heartbeat e CRLF sem duplicar eventos',async()=>{
  const {criarParser}=await import('../web/src/services/sseParser.js');const eventos=[],parse=criarParser(e=>eventos.push(e));
  parse(': heartbeat\r\n\r\nevent: atual');parse('izar\r\ndata: {"tipo":"agenda"}\r');parse('\n\r\nevent: atualizar\ndata: {"tipo":"whatsapp"}\n\n');
  assert.deepEqual(eventos.map(e=>JSON.parse(e.dados).tipo),['agenda','whatsapp']);assert.throws(()=>parse('x'.repeat(131073)),/limite/);
});
