const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
function carregarOffline(){
 const store=new Map();const files=new Map();
 const secure={getItemAsync:async k=>store.get(k)||null,setItemAsync:async(k,v)=>store.set(k,v),WHEN_UNLOCKED_THIS_DEVICE_ONLY:1};
 const sealed={fromCombined:value=>Buffer.from(value,'base64')};
 const aes={randomUUID:crypto.randomUUID,AESEncryptionKey:{generate:async()=>({encoded:async()=>crypto.randomBytes(32).toString('base64')}),import:async raw=>Buffer.from(raw,'base64')},AESSealedData:sealed,
 aesEncryptAsync:async(bytes,key,opts)=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(opts.additionalData));const content=Buffer.concat([c.update(bytes),c.final()]);return {combined:async()=>Buffer.concat([iv,content,c.getAuthTag()]).toString('base64')};},
 aesDecryptAsync:async(bytes,key,opts)=>{const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAAD(Buffer.from(opts.additionalData));d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]);}};
 const sqlite={openDatabaseAsync:async name=>{const d=new DatabaseSync(':memory:');files.set(name,d);return {execAsync:async sql=>d.exec(sql),runAsync:async(sql,...p)=>d.prepare(sql).run(...p),getAllAsync:async(sql,...p)=>d.prepare(sql).all(...p),getFirstAsync:async(sql,...p)=>d.prepare(sql).get(...p)};}};
 const code=require('../mobile/node_modules/@babel/core').transformSync(fs.readFileSync(require.resolve('../mobile/src/database/sqlite.js'),'utf8'),{babelrc:false,configFile:false,plugins:[require.resolve('../mobile/node_modules/@babel/plugin-transform-modules-commonjs')]}).code;
 const m={exports:{}};new Function('require','module','exports',code)(n=>({'expo-sqlite':sqlite,'expo-crypto':aes,'expo-secure-store':secure}[n]),m,m.exports);
 return {api:m.exports,store,files,login(e,u){store.set('climasaas_usuario',JSON.stringify({id:u,empresa_id:e}));store.set('climasaas_token','token-'+e+'-'+u);},close(){for(const d of files.values())d.close();}};
}
test('offline separa contas, cifra payload/cache e mantém fila do dono',async()=>{
 const x=carregarOffline();try{x.login(3,7);await x.api.enfileirar('CRIAR_OS',{nome:'DADO_PRIVADO'});await x.api.salvarCache('agenda','DADO_PRIVADO');const first=[...x.files.values()][0];assert(!first.prepare('SELECT payload FROM fila_sync').get().payload.includes('DADO_PRIVADO'));assert(!first.prepare('SELECT valor FROM cache_dados').get().valor.includes('DADO_PRIVADO'));
 const scope=await x.api.obterEscopoOffline();x.login(4,8);assert.deepEqual(await x.api.listarFila(),[]);assert.equal(await x.api.lerCache('agenda'),null);await assert.rejects(x.api.verificarEscopoOffline(scope),e=>e.status===503);assert(!x.files.has('climasaas_offline.db'));x.login(3,7);assert.equal((await x.api.listarFila()).length,1);assert.equal((await x.api.lerCache('agenda')).dados,'DADO_PRIVADO');first.exec("UPDATE cache_dados SET updated_at=datetime('now','-8 days')");assert.equal(await x.api.lerCache('agenda'),null);
 }finally{x.close();}
});
test('offline recusa payload cifrado adulterado',async()=>{const x=carregarOffline();try{x.login(3,7);await x.api.enfileirar('CRIAR_OS',{nome:'privado'});const d=[...x.files.values()][0];d.exec("UPDATE fila_sync SET payload='AAAA'");await assert.rejects(x.api.listarFila());}finally{x.close();}});

test('resposta mobile em trânsito não é entregue após troca de conta',async()=>{
 const x=carregarOffline();x.login(3,7);
 const secure={getItemAsync:async k=>x.store.get(k)||null,setItemAsync:async(k,v)=>x.store.set(k,v),deleteItemAsync:async k=>x.store.delete(k)};
 let release,notify;const started=new Promise(r=>notify=r);const pending=new Promise(r=>release=r);
 const code=require('../mobile/node_modules/@babel/core').transformSync(fs.readFileSync(require.resolve('../mobile/src/services/api.js'),'utf8'),{babelrc:false,configFile:false,plugins:[require.resolve('../mobile/node_modules/@babel/plugin-transform-modules-commonjs')]}).code;
 const m={exports:{}};
 new Function('require','module','exports','fetch',code)(n=>({'../database/sqlite':x.api,'react-native':{Platform:{OS:'android'}},'expo-secure-store':secure,'expo-file-system':{File:class{}},'expo/fetch':{fetch:()=>{throw new Error('Upload inesperado');}}}[n]),m,m.exports,async()=>{notify();return pending;});
 try{const request=m.exports.api.chamadaAutenticada('/os/agenda');await started;x.login(4,8);release({status:200,ok:true,text:async()=>JSON.stringify([{nome:'CONTA_ANTERIOR'}])});await assert.rejects(request,e=>e.status===503);assert.equal(x.store.get('climasaas_token'),'token-4-8');}finally{x.close();}
});
