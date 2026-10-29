const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {aplicarMigracoes}=require('../src/database/migrate');
const diretorio=path.join(__dirname,'../src/database');
const patches=fs.readdirSync(path.join(diretorio,'patches')).filter(p=>p.endsWith('.sql')).sort();
const conteudos=new Map(patches.map(p=>[fs.readFileSync(path.join(diretorio,'patches',p),'utf8'),p]));
function banco(falhar){
  let aplicadas=new Set();const executados=[];let transacoes=0;
  return {executados,get aplicadas(){return [...aplicadas];},get transacoes(){return transacoes;},async transaction(fn){
    transacoes++;const anteriores=new Set(aplicadas);
    try{return await fn({query:async(sql,args)=>{
      if(sql.startsWith('SELECT nome FROM schema_migrations'))return {rows:aplicadas.has(args[0])?[{nome:args[0]}]:[]};
      if(sql.startsWith('INSERT INTO schema_migrations')){aplicadas.add(args[0]);return {rows:[]};}
      const nome=conteudos.get(sql);if(nome){executados.push(nome);if(nome===falhar)throw new Error('Falha de patch');}
      return {rows:[]};
    }});}catch(e){aplicadas=anteriores;throw e;}
  }};
}
test('migração aplica patches em ordem e registra execução na mesma transação',async()=>{
  const db=banco();await aplicarMigracoes(db,diretorio);assert.deepEqual(db.executados,patches);assert.deepEqual(db.aplicadas,patches);assert.equal(db.transacoes,1);
});
test('migração repetida não reaplica patches já registrados',async()=>{
  const db=banco();await aplicarMigracoes(db,diretorio);await aplicarMigracoes(db,diretorio);assert.deepEqual(db.executados,patches);assert.equal(db.transacoes,2);
});
test('falha de patch interrompe a migração e não deixa histórico parcialmente confirmado',async()=>{
  const db=banco(patches[1]);await assert.rejects(aplicarMigracoes(db,diretorio),/Falha de patch/);assert.deepEqual(db.aplicadas,[]);assert.deepEqual(db.executados,patches.slice(0,2));
});
