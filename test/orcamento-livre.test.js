const test=require('node:test');const assert=require('node:assert/strict');const db=require('../src/config/database');const S=require('../src/services/OrcamentoService');
const item={tipo:'PECA',descricao:'Tubo de cobre',quantidade:2.5,valor_unitario:19.90,custo_unitario:10};
test('orcamento aceita prospect ou cliente, itens manuais e rejeita valores invalidos',()=>{
 assert(S.schema.safeParse({destinatario:{nome:'Futuro cliente'},itens:[item]}).success);assert(S.schema.safeParse({cliente_id:2,itens:[item]}).success);
 for(const body of [{itens:[item]},{cliente_id:2,destinatario:{nome:'Cliente'},itens:[item]},{destinatario:{nome:'Cliente'},aparelho_id:1,itens:[item]},{cliente_id:2,itens:[{...item,quantidade:-1}]},{cliente_id:2,itens:[{...item,valor_unitario:1.111}]},{cliente_id:2,itens:[item],empresa_id:8}])assert(!S.schema.safeParse(body).success);
});
test('totais usam centavos, aceitam quantidade fracionada e rejeitam desconto excessivo',()=>{
 const d=S.schema.parse({cliente_id:1,itens:[item,{...item,quantidade:3,valor_unitario:.1}],desconto:5});assert.deepEqual(S.totais(d),{subtotal:50.05,custo_total:55,total:45.05});assert.throws(()=>S.totais({...d,desconto:51}),/desconto/);
});
test('orcamento manual preserva empresa e destinatario sem cadastrar cliente nem baixar estoque',async()=>{
 const old=db.transaction;const calls=[];try{db.transaction=async fn=>fn({query:async(sql,p)=>{calls.push({sql,p});if(sql.includes('FROM empresas'))return {rows:[{nome:'Empresa',cnpj:'11222333000181',endereco:'Rua teste'}]};if(sql.startsWith('INSERT INTO orcamentos'))return {rows:[{id:5,total:49.75}]};return {rows:[]};}});const d=S.schema.parse({destinatario:{nome:'Interessado',telefone:'11999999999'},itens:[item]});await S.criar(d,{empresa_id:7,usuario_id:3});const insert=calls.find(c=>c.sql.startsWith('INSERT INTO orcamentos'));assert.equal(insert.p[0],7);assert.equal(insert.p[1],null);assert.equal(JSON.parse(insert.p[10]).nome,'Interessado');assert.equal(JSON.parse(insert.p[11]).nome,'Empresa');assert(!calls.some(c=>c.sql.startsWith('INSERT INTO clientes')||/UPDATE produtos|estoque_movimentos/.test(c.sql)));assert.equal(calls.find(c=>c.sql.startsWith('INSERT INTO orcamento_itens')).p[2],null);}finally{db.transaction=old;}
});
test('orcamento rejeita cliente ou item de outra empresa',async()=>{
 const old=db.transaction;try{db.transaction=async fn=>fn({query:async sql=>({rows:sql.includes('FROM empresas')?[{nome:'Empresa'}]:[]})});await assert.rejects(S.criar(S.schema.parse({cliente_id:99,itens:[item]}),{empresa_id:7,usuario_id:3}),/Cliente invalido/);await assert.rejects(S.criar(S.schema.parse({destinatario:{nome:'Interessado'},itens:[{...item,referencia_id:99}]}),{empresa_id:7,usuario_id:3}),/catalogo invalido/);}finally{db.transaction=old;}
});
