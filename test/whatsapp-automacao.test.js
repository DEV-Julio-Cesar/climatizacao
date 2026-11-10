const test=require('node:test');
const assert=require('node:assert/strict');
const Bot=require('../src/services/WhatsAppBotService');
const Worker=require('../src/services/WhatsAppBotWorker');

test('recepção coleta somente nome, localidade e pedido e encaminha com contexto',()=>{
  let estado={proximaEtapa:'INICIO',dados:{},tentativas:0};
  for(const texto of ['Olá','1','Maria','Natal, Tirol','Limpeza de dois aparelhos'])estado=Bot.decidir(estado.proximaEtapa,texto,null,{dados:estado.dados,tentativas:estado.tentativas,tipo:'text',config:{nome_atendimento:'Clima Teste'}});
  assert.equal(estado.fila,'ESPERA');assert.equal(estado.ativo,false);
  assert.deepEqual(estado.dados,{servico:'LIMPEZA',nome:'Maria',localidade:'Natal, Tirol',descricao:'Limpeza de dois aparelhos'});
  assert.match(estado.texto,/confirmados por um atendente/);
});
test('intenção em linguagem natural e financeiro sem pedir endereço',()=>{
  const r=Bot.decidir('INICIO','meu ar não gela');assert.equal(r.dados.servico,'REPARO');assert.equal(r.proximaEtapa,'AGUARDANDO_NOME');
  const outro=Bot.decidir('AGUARDANDO_NOME','Ana',null,{dados:{servico:'OUTRO'}});assert.equal(outro.proximaEtapa,'AGUARDANDO_DESCRICAO');
});
test('escape humano, mídia, reinício e segunda resposta inválida saem de loops',()=>{
  for(const etapa of ['INICIO','AGUARDANDO_NOME','AGUARDANDO_LOCALIDADE','AGUARDANDO_DESCRICAO'])assert.equal(Bot.decidir(etapa,'0').ativo,false);
  assert.equal(Bot.decidir('INICIO','[audio]',null,{tipo:'audio'}).fila,'ESPERA');
  assert.deepEqual(Bot.decidir('AGUARDANDO_NOME','menu',null,{dados:{nome:'Anterior'}}).dados,{});
  const r=Bot.decidir('AGUARDANDO_SERVICO','xyz');assert.equal(r.tentativas,1);
  assert.equal(Bot.decidir(r.proximaEtapa,'xyz',null,{tentativas:r.tentativas}).fila,'ESPERA');
  assert.equal(Bot.decidir('AGUARDANDO_NOME','123456').tentativas,1);
});
test('desativação não responde e a marca é específica da empresa',()=>{
  assert.equal(Bot.decidir('INICIO','Olá',null,{config:{ativo:false}}).texto,null);
  assert.match(Bot.menu({nome_atendimento:'Empresa A'}),/Empresa A/);
  assert.ok(!Bot.menu({nome_atendimento:'Empresa B'}).includes('Empresa A'));
});
function executor(tarefa){const chamadas=[];return{chamadas,transaction:async fn=>fn({query:async(sql,params)=>{chamadas.push({sql,params});return{rows:sql.startsWith('SELECT q.')?[tarefa]:[]};}})};}
const tarefa=()=>({id:1,empresa_id:10,conversa_id:20,telefone:'5500000000000',texto:'Olá',versao:1,bot_versao:1,fila_status:'AUTOMACAO',janela_atendimento_ate:new Date(Date.now()+60000)});
test('worker registra resposta confirmada e preserva ordem das tarefas',async()=>{
  const db=executor(tarefa());let envios=0;
  await Worker.processar(db,{paraEmpresa:async id=>{assert.equal(id,10);return{enviarMensagem:async()=>{envios++;return{messages:[{id:'fake.worker'}]};}};}});
  assert.equal(envios,1);assert.ok(db.chamadas.some(c=>c.sql.includes('concluido_em=NOW()')));assert.match(db.chamadas[0].sql,/NOT EXISTS/);assert.match(db.chamadas[0].sql,/SKIP LOCKED/);
});
test('worker cancela tarefas de versão anterior, assumidas e janela vencida',async()=>{
  for(const extra of [{bot_versao:2},{atendente_id:7},{encerrado_em:new Date()},{janela_atendimento_ate:new Date(0)}]){
    const db=executor({...tarefa(),...extra});await Worker.processar(db,{paraEmpresa:async()=>{throw new Error('Não pode acessar transporte');}});
    assert.ok(db.chamadas.some(c=>c.sql.includes('CONTEXTO_ALTERADO')));assert.ok(!db.chamadas.some(c=>c.sql.includes('ENVIO_NAO_CONFIRMADO')));
  }
});
test('falha ambígua de envio vai para revisão humana sem repetição automática',async()=>{
  const db=executor(tarefa());await Worker.processar(db,{paraEmpresa:async()=>({enviarMensagem:async()=>{throw new Error('timeout');}})});
  assert.ok(db.chamadas.some(c=>c.sql==='ROLLBACK TO SAVEPOINT envio_bot'));
  assert.ok(db.chamadas.some(c=>c.sql.includes('ENVIO_NAO_CONFIRMADO')));
  assert.ok(db.chamadas.some(c=>c.sql.includes("fila_status='ESPERA'")));
});
