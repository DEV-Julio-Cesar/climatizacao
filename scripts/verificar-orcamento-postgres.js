// Disposable local PostgreSQL only; never loads .env.
const assert=require('node:assert/strict');
const target=process.env.SECURITY_TEST_DATABASE_URL;
if(!target)throw new Error('Informe SECURITY_TEST_DATABASE_URL descartavel.');
const u=new URL(target);if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.startsWith('/security_'))throw new Error('Exige banco local com prefixo security_.');
process.env.DATABASE_URL=target;process.env.NODE_ENV='test';
const db=require('../src/config/database');const {aplicarMigracoes}=require('../src/database/migrate');const S=require('../src/services/OrcamentoService');const F=require('../src/controllers/FinanceiroController');
async function main(){
 await aplicarMigracoes(db);await aplicarMigracoes(db);
 const e=(await db.query('INSERT INTO empresas(nome,cnpj,telefone,email,endereco) VALUES($1,$2,$3,$4,$5) RETURNING id',['Empresa teste','11222333000181','1133334444','empresa@example.test','Rua exemplo 1'])).rows[0].id;
 const user=(await db.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash,perfil) VALUES($1,'Admin',$2,'teste','ADMIN') RETURNING id",[e,'admin'+Date.now()+'@example.test'])).rows[0].id;
 const other=(await db.query("INSERT INTO empresas(nome) VALUES('Outra empresa') RETURNING id")).rows[0].id;
 const p=(await db.query("INSERT INTO produtos(empresa_id,nome,preco,custo,estoque) VALUES($1,'Suporte',85,40,10) RETURNING id",[e])).rows[0].id;
 const c=(await db.query("INSERT INTO clientes(empresa_id,nome) VALUES($1,'Cliente cadastrado') RETURNING id",[e])).rows[0].id;
 const item={tipo:'PECA',descricao:'Cobre manual',quantidade:5.5,valor_unitario:42.9,custo_unitario:20};const ator={empresa_id:e,usuario_id:user};
 const quote=await S.criar(S.schema.parse({destinatario:{nome:'Futuro cliente',telefone:'11999999999',email:'futuro@example.test',endereco:'Rua futura'},itens:[item,{tipo:'PECA',referencia_id:p,descricao:'Suporte',quantidade:1,valor_unitario:85}],desconto:20}),ator);
 assert.equal(Number(quote.total),300.95);assert.equal(quote.cliente_id,null);assert.equal(Number((await db.query('SELECT estoque FROM produtos WHERE id=$1',[p])).rows[0].estoque),10);
 assert.equal((await db.query('SELECT COUNT(*)::int n FROM clientes WHERE empresa_id=$1',[e])).rows[0].n,1);
 await db.query("UPDATE empresas SET nome='Nome alterado' WHERE id=$1",[e]);const detail=await S.carregar(quote.id,e);assert.equal(detail.empresa_nome,'Empresa teste');assert.equal(detail.cliente_nome,'Futuro cliente');assert.equal(detail.itens.length,2);assert.equal(await S.carregar(quote.id,other),null);
 const existente=await S.criar(S.schema.parse({cliente_id:c,itens:[item]}),ator);assert.equal((await S.carregar(existente.id,e)).cliente_nome,'Cliente cadastrado');
 const response={status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
 await db.query("UPDATE orcamentos SET status='APROVADO' WHERE id=$1",[quote.id]);await F.converter({params:{id:quote.id},usuarioLogado:ator},response);assert.equal(response.code,201);assert(response.data.cliente_id);assert.equal((await db.query('SELECT COUNT(*)::int n FROM clientes WHERE empresa_id=$1',[e])).rows[0].n,2);
 assert.equal(Number((await db.query('SELECT estoque FROM produtos WHERE id=$1',[p])).rows[0].estoque),10);
 console.log('PostgreSQL: prospect, cliente cadastrado, itens mistos, estoque preservado, snapshots, isolamento e conversao em OS: OK');
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>db.pool.end());
