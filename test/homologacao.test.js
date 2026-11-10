const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('../src/validators/osValidator');
const cadastro = require('../src/validators/cadastroValidator');

function validar(middleware, body) {
  const req = { body }, res = { statusCode: 200, status(n) { this.statusCode=n;return this; },json(data){this.body=data;return this;} };
  let avancou=false;middleware(req,res,()=>{avancou=true;});return {req,res,avancou};
}
test('contratos após Zod 4: coerção, defaults e rejeição de empresa no corpo de OS',()=>{
  const body={cliente_id:'1',tipo_servico:'LIMPEZA',descricao_problema:'Limpeza preventiva do equipamento'};
  const valido=validar(os.validarCriacaoOs,body);
  assert.equal(valido.avancou,true);assert.equal(valido.req.body.cliente_id,1);assert.equal(valido.req.body.duracao_prevista_minutos,120);
  const injetado=validar(os.validarCriacaoOs,{...body,empresa_id:999});
  assert.equal(injetado.res.statusCode,400);assert.equal(injetado.avancou,false);
  const cliente=validar(cadastro.validarCliente,{nome:'Cliente de teste'});
  assert.equal(cliente.avancou,true);assert.equal(cliente.req.body.telefone,'');assert.equal(cliente.req.body.quantidade_aparelhos,0);
});
test('contratos após Zod 4: coleções grandes, GPS e datas inválidas geram 400 estruturado',()=>{
  const execucao={diagnostico:'Diagnóstico completo',solucao_aplicada:'Solução aplicada',medicoes:{},checklist:[{item:'Limpeza',conforme:true}],itens:[]};
  const invalidos=[
    validar(os.validarExecucaoOs,{...execucao,checklist:Array(51).fill({item:'Limpeza',conforme:true})}),
    validar(os.validarExecucaoOs,{...execucao,itens:Array(101).fill({tipo:'SERVICO',descricao:'Serviço',quantidade:1,valor_unitario:10})}),
    validar(os.validarEventoOs,{evento:'CHECKOUT'}),
    validar(os.validarCriacaoOs,{cliente_id:1,tipo_servico:'LIMPEZA',descricao_problema:'Descrição de teste',agendado_para:'2026-02-30T09:00:00-03:00'}),
  ];
  for(const r of invalidos){assert.equal(r.avancou,false);assert.equal(r.res.statusCode,400);assert.ok(Array.isArray(r.res.body.detalhes));assert.ok(r.res.body.detalhes.length>0);}
});
test('homologação recusa banco operacional como fallback e URL de navegador fora do loopback',()=>{
  for(const file of ['scripts/e2e-server.cjs','scripts/e2e-runner.cjs']){
    let abriu=false;
    const contexto={__dirname:require('node:path').resolve('scripts'),URL,console,process:{env:{DATABASE_URL:'postgresql://nao-usar.example/producao'},cwd:()=>process.cwd()},require(nome){
      if(nome==='pg')return {Pool:class {constructor(){abriu=true;}}};
      return require(nome);
    }};
    assert.throws(()=>vm.runInNewContext(fs.readFileSync(file,'utf8'),contexto),/TEST_DATABASE_URL/);assert.equal(abriu,false);
  }
  assert.throws(()=>vm.runInNewContext(fs.readFileSync('scripts/e2e-server.cjs','utf8'),{
    require,URL,process:{env:{TEST_DATABASE_URL:'postgresql://teste.example/teste',E2E_BASE_URL:'https://producao.example'}}
  }),/127\.0\.0\.1/);
});
