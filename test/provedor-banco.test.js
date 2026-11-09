const test=require('node:test');
const assert=require('node:assert/strict');
const {identificarProvedor}=require('../src/services/ProvedorBancoService');
test('Neon hospedado em regiao AWS continua identificado como Neon',()=>{
 const url='postgresql://pessoa:segredo@ep-exemplo.sa-east-1.aws.neon.tech/app';const r=identificarProvedor(url);assert.equal(r.provedor,'Neon');assert.equal(r.local,false);assert(!JSON.stringify(r).includes('segredo'));assert(!JSON.stringify(r).includes('pessoa'));
});
test('provedor distingue RDS de banco dentro da instancia',()=>{
 assert.equal(identificarProvedor('postgresql://u:p@clima.abc.sa-east-1.rds.amazonaws.com/app').provedor,'AWS RDS/Aurora');
 assert.equal(identificarProvedor('postgresql://u:p@127.0.0.1/app').local,true);
 assert.equal(identificarProvedor('postgresql://u:p@db.exemplo.test/app').provedor,'PostgreSQL remoto nao identificado');
});
test('hostname parecido e senha nao alteram a classificacao',()=>{
 assert.equal(identificarProvedor('postgresql://neon.tech:localhost@neon.tech.exemplo.test/app').provedor,'PostgreSQL remoto nao identificado');
 assert.equal(identificarProvedor('invalido').provedor,'nao_identificado');
});
