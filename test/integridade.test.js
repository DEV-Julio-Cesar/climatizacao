const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/database');
const Pagamento = require('../src/services/PagamentoService');
const Estoque = require('../src/services/EstoqueService');
const Operacao = require('../src/services/OperacaoService');
const Contrato = require('../src/services/ContratoService');
const Alertas = require('../src/services/AlertaWorker');
const Relatorios = require('../src/services/RelatorioService');
const WhatsAppContas = require('../src/services/WhatsAppContaService');

test('pagamento rejeita excesso, preserva centavos e não repete lançamento', async () => {
  const pagamentos=[];
  const executor={transaction:async fn=>fn({query:async(sql,args)=>{
    if(sql.includes('FOR UPDATE'))return {rows:[{id:1,valor_total:'100.01'}]};
    if(sql.includes('client_uuid=$2'))return {rows:pagamentos.filter(p=>p.client_uuid===args[1])};
    if(sql.includes('SUM(valor)'))return {rows:[{total:pagamentos.reduce((s,p)=>s+p.valor,0)}]};
    if(sql.includes('INSERT INTO pagamentos')){const row={id:1,empresa_id:args[0],os_id:args[1],forma:args[2],valor:args[3],observacao:args[4],client_uuid:args[6]};pagamentos.push(row);return {rows:[row]};}
    throw new Error(sql);
  }})};
  const usuario={empresa_id:3,usuario_id:7};
  const dados={forma:'PIX',valor:80.01,client_uuid:'11111111-1111-4111-8111-111111111111'};
  assert.equal((await Pagamento.registrar(1,usuario,dados,executor)).saldo_restante,20);
  assert.equal((await Pagamento.registrar(1,usuario,dados,executor)).repetido,true);
  assert.equal(pagamentos.length,1);
  await assert.rejects(Pagamento.registrar(1,usuario,{...dados,valor:81},executor),e=>e.status===409);
  await assert.rejects(Pagamento.registrar(1,usuario,{forma:'PIX',valor:20.01},executor),e=>e.status===400);
});

for(const tecnico of [false,true])test(`baixa agrupa produto repetido e protege saldo ${tecnico?'do técnico':'central'}`,async()=>{
  let quantidade,registrados=0;
  const client={query:async(sql,args)=>{
    if(sql.includes('SELECT oi.id'))return {rows:[1,2].map(id=>({id,referencia_id:9,quantidade:4,nome:'Peça',estoque:5,tecnico_id:tecnico?7:null}))};
    if(sql.includes('UPDATE produtos')||sql.includes('UPDATE estoque_tecnico')){quantidade=args[0];assert.ok(sql.includes('>=$1'));return {rows:[]};}
    registrados++;return {rows:[]};
  }};
  await assert.rejects(Estoque.baixar(client,1,{tecnico_id:7},{empresa_id:3,usuario_id:7}),e=>e.status===422);
  assert.equal(quantidade,8);assert.equal(registrados,0);
});

test('operação offline devolve resultado persistido sem repetir efeitos e rejeita alteração do payload',async()=>{
  const original=db.transaction;let registro,efeitos=0;
  db.transaction=async fn=>fn({query:async(sql,args)=>{
    if(sql.startsWith('SELECT fingerprint'))return {rows:registro?[registro]:[]};
    if(sql.startsWith('INSERT INTO operacoes'))registro={fingerprint:args[3],resultado:JSON.parse(args[4])};
    return {rows:[]};
  }});
  const req=()=>({method:'POST',path:'/os',body:{cliente_id:1},usuarioLogado:{empresa_id:3,usuario_id:7},get:()=> 'uuid-operacao-123'});
  const executar=async()=>{efeitos++;return {id:40};};
  try{
    assert.deepEqual(await Operacao.transacao(req(),executar),{id:40});
    const repetida=req();assert.deepEqual(await Operacao.transacao(repetida,executar),{id:40});assert.equal(repetida.operacaoRepetida,true);assert.equal(efeitos,1);
    const alterada=req();alterada.body.cliente_id=2;await assert.rejects(Operacao.transacao(alterada,executar),e=>e.status===409);
  }finally{db.transaction=original;}
});

test('contrato gera aparelhos em sequência, aplica conflito e rejeita competência antiga',async()=>{
  const original=db.transaction;let ordinal=0;const horarios=[];
  db.transaction=async fn=>fn({query:async(sql,args)=>{
    if(sql.includes('FROM contratos'))return {rows:[{id:1,cliente_id:2,nome:'Plano',competencia:'2026-11-01'}]};
    if(sql.includes('FROM usuarios')||sql.includes('FROM clientes'))return {rows:[{id:2}]};
    if(sql.includes('FROM contrato_aparelhos'))return {rows:[{id:8},{id:9}]};
    if(sql.includes('tstzrange')){horarios.push(args[2]);return {rows:[]};}
    if(sql.includes('INSERT INTO ordens_servico'))return {rows:[{id:++ordinal,aparelho_id:args[2]}]};
    return {rows:[]};
  }});
  const usuario={empresa_id:3,usuario_id:1},dados={tecnico_id:7,agendado_para:'2026-11-01T12:00:00Z',duracao_prevista_minutos:60,competencia:'2026-11-01'};
  try{
    const r=await Contrato.gerarVisitas(1,usuario,dados);assert.equal(r.ordens.length,2);assert.equal(Date.parse(horarios[1])-Date.parse(horarios[0]),3600000);
    await assert.rejects(Contrato.gerarVisitas(1,usuario,{...dados,competencia:'2026-10-01'}),e=>e.status===409);
  }finally{db.transaction=original;}
});

test('alertas usam lock e chave única e não dependem de consultar notificações',async()=>{
  const original=db.transaction;const consultas=[];
  db.transaction=async fn=>fn({query:async sql=>{consultas.push(sql);return {rows:[{adquirido:true}]};}});
  try{await Alertas.processar();assert.equal(consultas.length,3);for(const sql of consultas.slice(1)){assert.ok(sql.includes('chave_alerta'));assert.ok(sql.includes('ON CONFLICT DO NOTHING'));assert.ok(sql.includes('deleted_at IS NULL'));}}
  finally{db.transaction=original;}
});

test('relatórios validam datas/filtros e CSV neutraliza fórmulas e preserva aspas',()=>{
  assert.throws(()=>Relatorios.filtros({inicio:'2026-11-02',fim:'2026-11-01'}),e=>e.status===400);
  assert.throws(()=>Relatorios.filtros({tecnico_id:'0'}),e=>e.status===400);
  const f=Relatorios.filtros({inicio:'2026-11-01',fim:'2026-11-02',tecnico_id:'7'});assert.equal(f.tecnico_id,7);
  const csv=Relatorios.csv([{id:1,cliente:'=2+2',tecnico:'Nome "teste"'}]);assert.ok(csv.includes("' =2+2".replace(' ','')));assert.ok(csv.includes('Nome ""teste""'));
});

test('WhatsApp identifica empresa pelo número destinatário antes de buscar o cliente',async()=>{
  const original=db.query;const consultas=[];
  db.query=async(sql,args)=>{consultas.push({sql,args});return sql.includes('empresas_whatsapp')?{rows:[{empresa_id:9}]}:{rows:[{cliente_id:50,nome:'Cliente'}]};};
  try{const r=await WhatsAppContas.identificar('numero-destino','5511999999999');assert.equal(r.empresa_id,9);assert.equal(consultas[0].args[0],'numero-destino');assert.deepEqual(consultas[1].args,[9,'5511999999999']);assert.equal(await WhatsAppContas.identificar(null,'5511999999999'),null);}
  finally{db.query=original;}
});
