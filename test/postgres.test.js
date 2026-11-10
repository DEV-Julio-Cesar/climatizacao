const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Pool } = require('pg');
const validarConflito = require('../src/controllers/os/validarConflito');

test('PostgreSQL: instalação, reaplicação de patches e agenda concorrente', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  // Usa exclusivamente o banco de testes explícito; nunca DATABASE_URL.
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `teste_${require('node:crypto').randomBytes(8).toString('hex')}`;
  const a = await pool.connect();
  let b;
  try {
    await a.query(`CREATE SCHEMA ${schema}`);
    await a.query(`SET search_path TO ${schema},public`);
    for (let vez = 0; vez < 2; vez++) {
      await a.query(fs.readFileSync('src/database/migration.sql', 'utf8'));
      for (const patch of fs.readdirSync('src/database/patches').filter(n => n.endsWith('.sql')).sort())
        await a.query(fs.readFileSync(`src/database/patches/${patch}`, 'utf8'));
    }
    assert.equal((await a.query("SELECT to_regclass('lgpd_auditoria') IS NOT NULL AND to_regclass('sessoes') IS NOT NULL AND to_regclass('fila_documentos') IS NOT NULL AS ok")).rows[0].ok, true);
    const empresa = (await a.query("INSERT INTO empresas(nome) VALUES('Teste') RETURNING id")).rows[0].id;
    const tecnico = (await a.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash) VALUES($1,'Técnico','teste@example.com','hash') RETURNING id", [empresa])).rows[0].id;
    const cliente = (await a.query("INSERT INTO clientes(empresa_id,nome) VALUES($1,'Cliente') RETURNING id", [empresa])).rows[0].id;
    b = await pool.connect();
    await b.query(`SET search_path TO ${schema},public`);
    await a.query('BEGIN'); await b.query('BEGIN');
    const inicio = '2026-11-01T12:00:00Z';
    await validarConflito(a, empresa, tecnico, inicio, 120);
    await a.query("INSERT INTO ordens_servico(empresa_id,cliente_id,tecnico_id,tipo_servico,descricao_problema,agendado_para) VALUES($1,$2,$3,'LIMPEZA','Teste',$4)", [empresa, cliente, tecnico, inicio]);
    const concorrente = validarConflito(b, empresa, tecnico, inicio, 120);
    const rejeitada = assert.rejects(concorrente, erro => erro.status === 409);
    await a.query('COMMIT');
    await rejeitada;
    await b.query('ROLLBACK');
    assert.equal(Number((await a.query('SELECT COUNT(*) FROM ordens_servico')).rows[0].count), 1);
    const os=(await a.query('SELECT id FROM ordens_servico LIMIT 1')).rows[0].id;
    await a.query('UPDATE ordens_servico SET valor_total=100 WHERE id=$1',[os]);
    const executor={transaction:async fn=>{
      const client=await pool.connect();
      try{await client.query(`SET search_path TO ${schema},public`);await client.query('BEGIN');const resultado=await fn(client);await client.query('COMMIT');return resultado;}
      catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }};
    const pagamento=require('../src/services/PagamentoService');
    const resultados=await Promise.allSettled([1,2].map(()=>pagamento.registrar(os,{empresa_id:empresa,usuario_id:tecnico},{forma:'PIX',valor:80},executor)));
    assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(Number((await a.query('SELECT SUM(valor) total FROM pagamentos WHERE os_id=$1',[os])).rows[0].total),80);
    const listener=await pool.connect();
    try{
      await listener.query('LISTEN climasaas_eventos');
      const notificado=new Promise((resolve,reject)=>{
        const receber=msg=>{const evento=JSON.parse(msg.payload);if(evento.empresa_id===empresa&&evento.tipo==='agenda'){clearTimeout(timer);listener.off('notification',receber);resolve(evento);}};
        const timer=setTimeout(()=>{listener.off('notification',receber);reject(new Error('Evento PostgreSQL não recebido.'));},2000);
        listener.on('notification',receber);
      });
      await a.query("UPDATE ordens_servico SET descricao_problema='Atualização em tempo real' WHERE id=$1",[os]);
      assert.equal((await notificado).tipo,'agenda');
    }finally{listener.release(true);}
    const recuperacao=require('../src/services/RecuperacaoSenhaService');
    process.env.EMAIL_QUEUE_SECRET ||= 'segredo-da-fila-no-banco-de-testes';
    await a.query("INSERT INTO sessoes(id,usuario_id,empresa_id,refresh_hash,expira_em) VALUES($1,$2,$3,'teste',NOW()+INTERVAL '1 day')",[require('node:crypto').randomUUID(),tecnico,empresa]);
    await recuperacao.solicitar('teste@example.com',executor);
    const fila=(await a.query('SELECT conteudo_cifrado FROM emails_recuperacao')).rows[0];
    const mensagem=recuperacao.decifrar(fila.conteudo_cifrado),url=new URL(mensagem.text.match(/https?:\/\/\S+/)[0]),token=new URLSearchParams(url.hash.split('?')[1]).get('token');
    assert.equal((await a.query("SELECT expira_em-created_at=INTERVAL '15 minutes' AS valido FROM recuperacoes_senha")).rows[0].valido,true);
    const redefinicoes=await Promise.allSettled([1,2].map(()=>recuperacao.redefinir(token,'SenhaNova123',executor)));
    assert.equal(redefinicoes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(Number((await a.query('SELECT COUNT(*) FROM sessoes WHERE revogada_em IS NULL')).rows[0].count),0);
    // Exercita os controllers contra o schema real, incluindo rollback da
    // desativação se a auditoria falhar. Nunca usa DATABASE_URL.
    const db = require('../src/config/database'), originalQuery = db.query, originalTransaction = db.transaction;
    const privacidade = require('../src/controllers/PrivacidadeController'), lgpd = require('../src/controllers/LgpdController');
    const requisicao = { usuarioLogado: { usuario_id: tecnico, empresa_id: empresa, perfil: 'TECNICO' }, query: {}, params: {}, ip: '127.0.0.1', body: { tipo: 'ACESSO', descricao: 'Quero acessar meus dados pessoais' } };
    const resposta = () => ({ statusCode: 200, setHeader() {}, clearCookie() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
    db.transaction = executor.transaction;
    db.query = (sql,args) => a.query(sql,args);
    try {
      const pedido = resposta(); await privacidade.criar(requisicao,pedido); assert.equal(pedido.statusCode,201);
      const lista = resposta(); await privacidade.listar(requisicao,lista); assert.equal(lista.body.solicitacoes.length,1);
      assert.equal(lista.body.solicitacoes[0].protocolo,pedido.body.protocolo);
      const detalhe=resposta();await privacidade.detalhes({...requisicao,params:{id:pedido.body.protocolo}},detalhe);
      assert.equal(detalhe.statusCode,200);assert.equal(detalhe.body.historico.length,1);
      const chavePedido=require('node:crypto').randomUUID();
      const concorrentePedido={...requisicao,headers:{'idempotency-key':chavePedido},body:{tipo:'CORRECAO',descricao:'Pedido concorrente de correção'}};
      const reenvios=await Promise.all([1,2].map(async()=>{const r=resposta();await privacidade.criar(concorrentePedido,r);return r;}));
      assert.deepEqual(reenvios.map(r=>r.statusCode).sort(),[200,201]);
      assert.equal(reenvios[0].body.protocolo,reenvios[1].body.protocolo);
      const filtrado=resposta();await privacidade.listar({...requisicao,query:{tipo:'CORRECAO',status:'RECEBIDA'}},filtrado);
      assert.equal(filtrado.body.solicitacoes.length,1);
      const alterado=resposta();await privacidade.criar({...concorrentePedido,body:{...concorrentePedido.body,descricao:'Conteúdo diferente para a mesma chave'}},alterado);assert.equal(alterado.statusCode,409);
      const outraEmpresa = (await a.query("INSERT INTO empresas(nome) VALUES('Outra') RETURNING id")).rows[0].id;
      const outro = resposta(); await privacidade.listar({ ...requisicao, usuarioLogado: { ...requisicao.usuarioLogado, empresa_id: outraEmpresa } },outro);
      assert.deepEqual(outro.body.solicitacoes,[]);
      const historicoOutra=resposta();await privacidade.detalhes({...requisicao,params:{id:pedido.body.protocolo},usuarioLogado:{...requisicao.usuarioLogado,empresa_id:outraEmpresa}},historicoOutra);assert.equal(historicoOutra.statusCode,404);
      const resumo = resposta(); await lgpd.exportarDados(requisicao,resumo); assert.equal(resumo.statusCode,200); assert.equal(resumo.body.ordens_servico.length,1);
      await a.query("INSERT INTO sessoes(id,usuario_id,empresa_id,refresh_hash,expira_em) VALUES($1,$2,$3,'teste',NOW()+INTERVAL '1 day')",[require('node:crypto').randomUUID(),tecnico,empresa]);
      await a.query("INSERT INTO dispositivos_push(usuario_id,empresa_id,token) VALUES($1,$2,'token-push-teste')",[tecnico,empresa]);
      const excluir = { ...requisicao, body: { confirmacao: 'CONFIRMAR_EXCLUSAO', senha_atual: 'SenhaNova123' } };
      db.transaction = fn => executor.transaction(client => fn({ query(sql,args) {
        if (sql.startsWith('INSERT INTO lgpd_auditoria')) throw new Error('Falha simulada de auditoria');
        return client.query(sql,args);
      } }));
      const falha = resposta(); await lgpd.excluirDados(excluir,falha); assert.equal(falha.statusCode,500);
      assert.equal((await a.query('SELECT ativo FROM usuarios WHERE id=$1',[tecnico])).rows[0].ativo,true);
      assert.equal(Number((await a.query('SELECT COUNT(*) FROM dispositivos_push WHERE usuario_id=$1',[tecnico])).rows[0].count),1);
      db.transaction = executor.transaction;
      const apagado = resposta(); await lgpd.excluirDados(excluir,apagado); assert.equal(apagado.statusCode,200); assert.equal(apagado.body.anonimizacao_completa,false);
      assert.equal((await a.query('SELECT ativo FROM usuarios WHERE id=$1',[tecnico])).rows[0].ativo,false);
      assert.equal(Number((await a.query('SELECT COUNT(*) FROM sessoes WHERE revogada_em IS NULL')).rows[0].count),0);
      assert.equal(Number((await a.query('SELECT COUNT(*) FROM dispositivos_push WHERE usuario_id=$1',[tecnico])).rows[0].count),0);
      assert.equal(Number((await a.query('SELECT COUNT(*) FROM privacidade_historico')).rows[0].count),2);
    } finally { db.query = originalQuery; db.transaction = originalTransaction; }
  } finally {
    if (b) { await b.query('ROLLBACK'); b.release(); }
    await a.query('ROLLBACK');
    await a.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    a.release(); await pool.end();
  }
});
