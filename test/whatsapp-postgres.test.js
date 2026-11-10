const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {Pool}=require('pg');
test('PostgreSQL WhatsApp: duplicação concorrente, triagem, isolamento e passagem humana',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const schema=`wa_${crypto.randomBytes(8).toString('hex')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});let pool;
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);
    const connection=new URL(process.env.TEST_DATABASE_URL);connection.searchParams.set('options',`-csearch_path=${schema},public`);
    pool=new Pool({connectionString:connection.toString()});
    await pool.query(fs.readFileSync('src/database/migration.sql','utf8'));
    for(const patch of fs.readdirSync('src/database/patches').filter(n=>n.endsWith('.sql')).sort())await pool.query(fs.readFileSync(`src/database/patches/${patch}`,'utf8'));
    const executor={query:(...args)=>pool.query(...args),transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
    const empresa=(await pool.query("INSERT INTO empresas(nome) VALUES('Empresa sintética A') RETURNING id")).rows[0].id;
    const outra=(await pool.query("INSERT INTO empresas(nome) VALUES('Empresa sintética B') RETURNING id")).rows[0].id;
    const usuario=(await pool.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash) VALUES($1,'Operador','wa@example.test','hash') RETURNING id",[empresa])).rows[0].id;
    const Automacao=require('../src/services/WhatsAppAutomacaoService'),Worker=require('../src/services/WhatsAppBotWorker');
    let ordem=0;const receber=(texto,id=`wa.${++ordem}`,empresaId=empresa)=>Automacao.receber({empresaId,telefone:'5500000000000',nomeContato:'Contato sintético',mensagem:{id,type:'text',text:{body:texto},timestamp:String(Math.floor(Date.now()/1000))}},executor);
    const reenvios=await Promise.all([receber('Olá','wa.unica'),receber('Olá','wa.unica')]);assert.equal(reenvios.filter(r=>r.duplicada).length,1);
    let conversa=(await pool.query('SELECT * FROM whatsapp_conversas WHERE empresa_id=$1',[empresa])).rows[0];
    assert.equal(conversa.nao_lidas,1);assert.equal((await pool.query('SELECT COUNT(*)::int n FROM whatsapp_respostas_bot')).rows[0].n,1);
    const enviados=[],contas={paraEmpresa:async id=>{assert.equal(id,empresa);return{enviarMensagem:async(_telefone,texto)=>{enviados.push(texto);return{messages:[{id:`saida.${enviados.length}`}]};}};}};
    await Worker.processar(executor,contas);
    for(const texto of ['1','Maria','Natal, Tirol','Limpeza de dois aparelhos']){await receber(texto);await Worker.processar(executor,contas);}
    conversa=(await pool.query('SELECT * FROM whatsapp_conversas WHERE empresa_id=$1',[empresa])).rows[0];
    assert.equal(conversa.fila_status,'ESPERA');assert.equal(conversa.bot_ativo,false);assert.equal(conversa.triagem.servico,'LIMPEZA');assert.equal(conversa.triagem.nome,'Maria');assert.equal(enviados.length,5);
    await receber('Mais uma informação');assert.equal((await pool.query('SELECT COUNT(*)::int n FROM whatsapp_respostas_bot')).rows[0].n,5);
    await pool.query("INSERT INTO whatsapp_automacao(empresa_id,nome_atendimento,ativo) VALUES($1,'Marca exclusiva A',TRUE),($2,'Marca exclusiva B',FALSE)",[empresa,outra]);
    assert.equal((await Automacao.configuracao(outra,executor)).nome_atendimento,'Marca exclusiva B');
    await receber('Olá','wa.outra',outra);assert.equal((await pool.query('SELECT fila_status FROM whatsapp_conversas WHERE empresa_id=$1',[outra])).rows[0].fila_status,'ESPERA');
    // Reiniciar cria uma nova versão: tarefas anteriores não podem responder.
    await pool.query("UPDATE whatsapp_conversas SET fila_status='AUTOMACAO',bot_ativo=TRUE,bot_etapa='INICIO',bot_versao=bot_versao+1 WHERE id=$1",[conversa.id]);
    await receber('Olá');
    const db=require('../src/config/database'),controller=require('../src/controllers/WhatsAppController');
    const originalQuery=db.query,originalTx=db.transaction;db.query=executor.query;db.transaction=executor.transaction;
    const req={params:{id:String(conversa.id)},usuarioLogado:{usuario_id:usuario,empresa_id:empresa},body:{}};
    const resposta=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
    try{
      const alheia=resposta();await controller.assumir({...req,usuarioLogado:{usuario_id:usuario,empresa_id:outra}},alheia);assert.equal(alheia.statusCode,404);
      const assumida=resposta();await controller.assumir(req,assumida);assert.equal(assumida.statusCode,200);assert.equal(assumida.body.atendente_id,usuario);
      await Worker.processar(executor,{paraEmpresa:async()=>{throw new Error('Não enviar após assumir');}});
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM whatsapp_respostas_bot WHERE ultimo_erro='CONTEXTO_ALTERADO'")).rows[0].n,1);
      await pool.query("UPDATE whatsapp_conversas SET janela_atendimento_ate=NOW()-INTERVAL '1 minute' WHERE id=$1",[conversa.id]);
      const expirada=resposta();await controller.enviarMensagem({...req,body:{texto:'Não enviar'}},expirada);assert.equal(expirada.statusCode,409);
      const encerrada=resposta();await controller.encerrar(req,encerrada);assert.equal(encerrada.statusCode,200);
      await receber('Novo pedido');assert.equal((await pool.query('SELECT bot_etapa FROM whatsapp_conversas WHERE id=$1',[conversa.id])).rows[0].bot_etapa,'AGUARDANDO_SERVICO');
      await pool.query("UPDATE whatsapp_conversas SET fila_status='AUTOMACAO',bot_ativo=TRUE WHERE empresa_id=$1",[outra]);
      const config=require('../src/controllers/WhatsAppAutomacaoController'),desativada=resposta();
      const formulario={ativo:false,nome_atendimento:'Recepção A',boas_vindas:'Bem-vindo à equipe A',horario_informativo:'',encaminhamento:'A equipe continuará o atendimento.'};
      await config.salvar({...req,body:formulario},desativada);assert.equal(desativada.statusCode,200);
      assert.equal((await pool.query('SELECT fila_status FROM whatsapp_conversas WHERE id=$1',[conversa.id])).rows[0].fila_status,'ESPERA');
      assert.equal((await pool.query('SELECT fila_status FROM whatsapp_conversas WHERE empresa_id=$1',[outra])).rows[0].fila_status,'AUTOMACAO');
      assert.equal((await Automacao.configuracao(empresa,executor)).ativo,false);
      await Worker.processar(executor,{paraEmpresa:async()=>{throw new Error('Não enviar após desativar');}});
      assert.equal((await pool.query("SELECT COUNT(*)::int n FROM whatsapp_respostas_bot WHERE ultimo_erro='CONTEXTO_ALTERADO'")).rows[0].n,2);
    }finally{db.query=originalQuery;db.transaction=originalTx;}
  }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
