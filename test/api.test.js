process.env.WHATSAPP_EMPRESA_ID = '3';
process.env.JWT_SECRET = 'segredo-de-teste-com-tamanho-adequado';
process.env.APP_URL = 'http://localhost:3000';
process.env.WHATSAPP_VERIFY_TOKEN = 'token-webhook-teste';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const db = require('../src/config/database');
const OsModel = require('../src/models/OsModel');
const WhatsAppBotService = require('../src/services/WhatsAppBotService');
const WhatsAppService = require('../src/services/WhatsAppService');
const PdfService = require('../src/services/PdfService');

async function request(server, pathname, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, options);
  return { status: response.status, body: await response.json() };
}

const token = jwt.sign({ token_use: 'access', sid: '00000000-0000-4000-8000-000000000001', usuario_id: 7, empresa_id: 3, perfil: 'TECNICO' }, process.env.JWT_SECRET);
const tokenGestor = jwt.sign({ token_use: 'access', sid: '00000000-0000-4000-8000-000000000001', usuario_id: 2, empresa_id: 3, perfil: 'GESTOR' }, process.env.JWT_SECRET);
const tokenRestrito = jwt.sign({ token_use: 'access', sid: '00000000-0000-4000-8000-000000000001', usuario_id: 8, empresa_id: 3, perfil: 'TECNICO', permissoes: [] }, process.env.JWT_SECRET);

/**
 * Resposta padrão do authMiddleware.
 * Toda query que bate em "SELECT ativo, deleted_at, senha_alterada_em FROM usuarios"
 * deve retornar esse objeto para que o middleware autorize a requisição.
 * Os testes que mockam db.query precisam incluir esse caso.
 */
const AUTH_MIDDLEWARE_SQL = 'SELECT ativo, deleted_at, senha_alterada_em';
const authOk = { rows: [{ ativo: true, deleted_at: null, senha_alterada_em: null }] };

let server;

test.before(() => { server = createApp().listen(0); });
test.after(async () => { await new Promise((resolve) => server.close(resolve)); await db.pool.end(); });

test('health check responde sem autenticação', async () => {
  const result = await request(server, '/health');
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'ok');
});

test('recuperação responde sem revelar cadastro e limita a conta entre IPs',async()=>{
  const service=require('../src/services/RecuperacaoSenhaService'),config=service.configurado,solicitar=service.solicitar;
  service.configurado=()=>true;const recebidos=[];service.solicitar=async email=>{recebidos.push(email);};
  try{
    let texto;
    for(let i=0;i<4;i++){
      const resposta=await request(server,'/auth/senha/solicitar',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`198.51.102.${i+1}`},body:JSON.stringify({email:i%2?'RECUPERACAO@example.com':'recuperacao@example.com'})});
      assert.equal(resposta.status,i<3?202:429);
      if(i===0)texto=resposta.body;if(i<3)assert.deepEqual(resposta.body,texto);
      assert.equal(resposta.body.token,undefined);
    }
    assert.deepEqual(recebidos,Array(3).fill('recuperacao@example.com'));
  }finally{service.configurado=config;service.solicitar=solicitar;}
});

test('redefinição limita tentativas por token mesmo trocando de IP',async()=>{
  for(let i=0;i<6;i++){
    const resposta=await request(server,'/auth/senha/redefinir',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`198.51.103.${i+1}`},body:JSON.stringify({token:'a'.repeat(43),nova_senha:'curta'})});
    assert.equal(resposta.status,i<5?400:429);
  }
});

test('login não cria sessão quando a senha muda antes da emissão',async()=>{
  const query=db.query,transaction=db.transaction;let criou=false;
  const senha_hash=await require('bcryptjs').hash('SenhaAnterior123',4);
  db.query=async sql=>sql.includes('FROM usuarios')?{rows:[{id:7,empresa_id:3,nome:'Pessoa',perfil:'TECNICO',senha_hash}]}:{rows:[]};
  db.transaction=async fn=>fn({query:async sql=>{if(sql.includes('INSERT INTO sessoes'))criou=true;assert.ok(sql.includes('FOR UPDATE'));return {rows:[]};}});
  try{const r=await request(server,'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'corrida@example.com',senha:'SenhaAnterior123'})});assert.equal(r.status,401);assert.equal(criou,false);}
  finally{db.query=query;db.transaction=transaction;}
});

test('troca autenticada bloqueia usuário e revoga sessões e links pendentes',async()=>{
  const transaction=db.transaction;const bcrypt=require('bcryptjs'),Auth=require('../src/controllers/AuthController');
  const anterior=await bcrypt.hash('SenhaAnterior123',4),consultas=[];let nova;
  db.transaction=async fn=>fn({query:async(sql,args)=>{consultas.push(sql);if(sql.startsWith('SELECT senha_hash')){assert.ok(sql.includes('FOR UPDATE'));return {rows:[{senha_hash:anterior}]};}if(sql.startsWith('UPDATE usuarios'))nova=args[0];return {rows:[]};}});
  const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
  try{await Auth.alterarSenha({body:{senha_atual:'SenhaAnterior123',nova_senha:'SenhaNova123'},usuarioLogado:{usuario_id:7,empresa_id:3}},res);assert.equal(res.statusCode,200);assert.equal(await bcrypt.compare('SenhaNova123',nova),true);assert.ok(consultas.some(s=>s.startsWith('UPDATE sessoes')));assert.ok(consultas.some(s=>s.startsWith('UPDATE recuperacoes_senha')));}
  finally{db.transaction=transaction;}
});

test('permissão removida no banco bloqueia token antigo de gestor imediatamente',async()=>{
  const original=db.query;
  db.query=async sql=>{assert.ok(sql.includes(AUTH_MIDDLEWARE_SQL));return {rows:[{...authOk.rows[0],perfil:'TECNICO',nome:'Técnico',overrides:[{permissao:'AGENDA_VISUALIZAR',permitido:false}]}]};};
  try{assert.equal((await request(server,'/os/agenda',{headers:{Authorization:`Bearer ${tokenGestor}`}})).status,403);}
  finally{db.query=original;}
});

test('listagem de ordens restringe técnico e mantém visão empresarial do gestor',async()=>{
  const original=db.query,listar=OsModel.listarTodas;const argumentos=[];
  db.query=async()=>authOk;OsModel.listarTodas=async(...args)=>{argumentos.push(args);return [];};
  try{
    assert.equal((await request(server,'/os/todas',{headers:{Authorization:`Bearer ${token}`}})).status,200);
    assert.equal((await request(server,'/os/todas',{headers:{Authorization:`Bearer ${tokenGestor}`}})).status,200);
    assert.deepEqual(argumentos,[[3,7],[3,null]]);
  }finally{db.query=original;OsModel.listarTodas=listar;}
});

test('pagamento rejeita frações de centavo antes de alterar o banco',async()=>{
  const original=db.query;db.query=async sql=>{assert.ok(sql.includes(AUTH_MIDDLEWARE_SQL));return authOk;};
  try{assert.equal((await request(server,'/os/1/pagamentos',{method:'POST',headers:{Authorization:`Bearer ${tokenGestor}`,'Content-Type':'application/json'},body:JSON.stringify({forma:'PIX',valor:1.001})})).status,400);}
  finally{db.query=original;}
});

test('limite por conta bloqueia tentativas com IPs diferentes e e-mail normalizado',async()=>{
  const original=db.query;db.query=async()=>({rows:[]});
  try{
    for(let i=0;i<11;i++){
      const resposta=await request(server,'/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`198.51.100.${i+1}`},body:JSON.stringify({email:i%2?'ATAQUE@example.com':'ataque@example.com',senha:'errada123'})});
      assert.equal(resposta.status,i<10?401:429);
    }
  }finally{db.query=original;}
});

test('recuperação de legado autoriza somente referências da empresa e exige gestão',async()=>{
  const original=db.query;
  db.query=async(sql,args)=>{
    if(sql.includes(AUTH_MIDDLEWARE_SQL))return authOk;
    assert.equal(args[1],3);
    if(sql.includes('FROM ordens_servico'))return {rows:[{id:10}]};
    if(sql.includes('FROM clientes'))return {rows:[{id:20}]};
    throw new Error(sql);
  };
  const options=t=>({method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({itens:[{id:1,tipo:'FOTO_OS',os_id:10},{id:2,tipo:'FOTO_OS',os_id:999},{id:3,tipo:'CRIAR_OS',cliente_id:20}]})});
  try{
    assert.equal((await request(server,'/offline/verificar-legado',options(token))).status,403);
    const r=await request(server,'/offline/verificar-legado',options(tokenGestor));assert.equal(r.status,200);assert.deepEqual(r.body.autorizados,[1,3]);
  }finally{db.query=original;}
});

test('refresh token não acessa recursos e access token não renova sessão', async () => {
  const refresh = jwt.sign({ token_use: 'refresh', sid: '00000000-0000-4000-8000-000000000001', usuario_id: 7, empresa_id: 3 }, process.env.JWT_SECRET);
  assert.equal((await request(server, '/os/agenda', { headers: { Authorization: `Bearer ${refresh}` } })).status, 401);
  assert.equal((await request(server, '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: token }) })).status, 401);
});

test('arquivo exige link assinado e rejeita expiração e troca de caminho', async () => {
  const caminho = '/arquivos/fotos/evidencia';
  assert.equal((await request(server, caminho)).status, 401);
  const { assinarUrl } = require('../src/services/ArquivoService');
  assert.equal((await request(server, assinarUrl(caminho, 3, '-1s'))).status, 401);
  assert.equal((await request(server, assinarUrl(caminho, 3).replace('/fotos/evidencia', '/fotos/outra'))).status, 401);
});

test('técnico não contorna permissão de reagendamento pela rota agendar', async () => {
  const original = db.query;
  db.query = async sql => { assert.ok(sql.includes(AUTH_MIDDLEWARE_SQL)); return authOk; };
  try {
    assert.equal((await request(server, '/os/1/agendar', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ agendado_para: '2026-11-01T12:00:00Z' }) })).status, 403);
  } finally { db.query = original; }
});

test('exportação de técnico não consulta cadastro empresarial de clientes', async () => {
  const original = db.query;
  db.query = async sql => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    assert.ok(!sql.includes('FROM clientes'), 'não deve exportar clientes da empresa');
    return { rows: [] };
  };
  try {
    const resposta = await request(server, '/conta/dados', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.body.clientes_empresa, []);
  } finally { db.query = original; }
});

test('sessão web usa cookie, rotaciona refresh e revoga acesso no logout', async () => {
  const original = db.query;
  const originalTransaction=db.transaction;
  db.transaction=async fn=>fn({query:(...args)=>db.query(...args)});
  const bcrypt = require('bcryptjs');
  const senha_hash = await bcrypt.hash('senha123', 4);
  let sessao;
  const usuario = { id: 7, empresa_id: 3, nome: 'Técnico', perfil: 'TECNICO', ativo: true, senha_hash };
  db.query = async (sql, args) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return sessao?.revogada ? { rows: [] } : authOk;
    if (sql.includes('FROM usuarios')) return { rows: [usuario] };
    if (sql.includes('FROM usuario_permissoes')) return { rows: [] };
    if (sql.includes('INSERT INTO sessoes')) { sessao = { id: args[0], hash: args[3] }; return { rows: [] }; }
    if (sql.includes('UPDATE sessoes SET refresh_hash')) {
      if (sessao.revogada || sessao.hash !== args[4]) return { rows: [] };
      sessao.hash = args[0]; return { rows: [{ id: sessao.id }] };
    }
    if (sql.includes('UPDATE sessoes SET revogada_em')) { sessao.revogada = true; return { rows: [] }; }
    throw new Error(`SQL inesperado: ${sql}`);
  };
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'tecnico@example.com', senha: 'senha123', cliente: 'web' }) });
    assert.equal(login.status, 200);
    const dados = await login.json();
    assert.equal(dados.refresh_token, undefined);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const renovar = () => fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente: 'web' }) });
    const renovada = await renovar();
    assert.equal(renovada.status, 200);
    const novoCookie = renovada.headers.get('set-cookie').split(';')[0];
    assert.notEqual(novoCookie, cookie);
    const somenteCookie=await fetch(`${base}/auth/refresh`,{method:'POST',headers:{Cookie:novoCookie,'Content-Type':'application/json'},body:'{}'});
    assert.equal(somenteCookie.status,200);
    assert.equal((await somenteCookie.json()).refresh_token,undefined,'cookie não deve permitir extrair refresh por JSON');
    assert.equal((await renovar()).status, 401, 'refresh consumido não pode ser reutilizado');
    assert.equal((await fetch(`${base}/auth/refresh/logout`, { method: 'POST', headers: { Cookie: novoCookie } })).status, 200);
    assert.equal((await request(server, '/os/agenda', { headers: { Authorization: `Bearer ${dados.token}` } })).status, 401);
  } finally { db.query = original; db.transaction=originalTransaction; }
});

test('rota protegida recusa chamada sem token', async () => {
  const result = await request(server, '/os/agenda');
  assert.equal(result.status, 401);
});

test('validação rejeita campos de tenant enviados pelo cliente', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/os', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: 99, cliente_id: 1, tipo_servico: 'LIMPEZA', descricao_problema: 'Teste válido',
      }),
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.erro, 'Falha na validação de entrada.');
  } finally { db.query = originalQuery; }
});

test('criação usa empresa e técnico do token', async () => {
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction = async (callback) => callback({
    query: async (sql, params) => {
      if (sql.includes('FROM clientes')) return { rows: [{ id: params[0] }] };
      if (sql.includes('FROM usuarios')) {
        assert.deepEqual(params, [7, 3]);
        return { rows: [{ id: 7 }] };
      }
      if (sql.includes('INSERT INTO ordens_servico')) {
        assert.equal(params[0], 3);
        assert.equal(params[3], 7);
        return { rows: [{ id: 10, status: 'ABERTA', empresa_id: 3, tecnico_id: 7 }] };
      }
      if (sql.includes('INSERT INTO fila_documentos')) return { rows: [] };
      if (sql.includes('INSERT INTO os_historico')) return { rows: [] };
      throw new Error(`SQL não esperado: ${sql}`);
    },
  });
  try {
    const result = await request(server, '/os', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: 1, tipo_servico: 'LIMPEZA', descricao_problema: 'Limpeza completa' }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.os.empresa_id, 3);
  } finally { db.query = originalQuery; db.transaction = originalTransaction; }
});

test('técnico não pode reagendar O.S.', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/os/1/reagendar', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tecnico_id: 2, agendado_para: '2026-10-07T12:00:00-03:00' }),
    });
    assert.equal(result.status, 403);
  } finally { db.query = originalQuery; }
});

test('permissão granular bloqueia agenda mesmo com token válido', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/os/agenda', { headers: { Authorization: `Bearer ${tokenRestrito}` } });
    assert.equal(result.status, 403);
    assert.equal(result.body.erro, 'Permissão necessária: AGENDA_VISUALIZAR.');
  } finally { db.query = originalQuery; }
});

test('agenda rejeita filtro desconhecido antes de consultar o banco', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/os/agenda?filtro=QUALQUER', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.erro, 'Filtro de agenda inválido.');
  } finally { db.query = originalQuery; }
});

test('check-in exige coordenadas válidas', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/os/10/eventos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento: 'CHECKIN' }),
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.erro, 'Falha na validação de entrada.');
  } finally { db.query = originalQuery; }
});

test('check-out exige coordenadas válidas (Bug 11 corrigido)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/os/10/eventos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento: 'CHECKOUT' }),
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.erro, 'Falha na validação de entrada.');
  } finally { db.query = originalQuery; }
});

test('execução rejeita item de catálogo de outra empresa', async () => {
  const executor = { query: async () => ({ rows: [] }) };
  await assert.rejects(() => OsModel.salvarExecucao(10, 3, {
    diagnostico: 'Teste', solucao_aplicada: 'Teste', recomendacoes: '', garantia_dias: 0,
    retorno_necessario: false, checklist: [], medicoes: {},
    itens: [{ tipo: 'PECA', referencia_id: 999, descricao: 'Peça externa', quantidade: 1, valor_unitario: 10 }],
  }, executor), (error) => error.status === 400 && /catálogo inválido/.test(error.message));
});

test('registro push rejeita token malformado', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/dispositivos/push', {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ token:'token-invalido', plataforma:'android' }),
    });
    assert.equal(result.status, 400);
  } finally { db.query = originalQuery; }
});

test('arquivo de evidência persistido pode ser recuperado após deploy', async () => {
  const originalQuery = db.query;
  db.query = async (sql, params) => {
    assert.match(sql, /storage_key/);
    assert.equal(params[0], '123e4567-e89b-12d3-a456-426614174000');
    return { rows: [{ conteudo: Buffer.from('imagem-teste'), mime_type: 'image/jpeg' }] };
  };
  try {
    const address = server.address();
    const response = await fetch(require('../src/services/ArquivoService').assinarUrl(`http://127.0.0.1:${address.port}/arquivos/fotos/123e4567-e89b-12d3-a456-426614174000`, 3));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'imagem-teste');
  } finally { db.query = originalQuery; }
});

test('PDF persistido da ordem pode ser recuperado após deploy', async () => {
  const originalQuery = db.query;
  db.query = async (sql, params) => {
    assert.match(sql, /pdf_storage_key/);
    assert.equal(params[0], '123e4567-e89b-12d3-a456-426614174001');
    return { rows: [{ id: 42, pdf_conteudo: Buffer.from('%PDF-teste') }] };
  };
  try {
    const address = server.address();
    const response = await fetch(require('../src/services/ArquivoService').assinarUrl(`http://127.0.0.1:${address.port}/arquivos/ordens/123e4567-e89b-12d3-a456-426614174001.pdf`, 3));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), '%PDF-teste');
  } finally { db.query = originalQuery; }
});

test('agenda impede conflito de horário para o mesmo técnico', async () => {
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction = async (callback) => callback({
    query: async (sql, params) => {
      if (sql.includes('FROM clientes')) return { rows: [{ id: params[0] }] };
      if (sql.includes('FROM usuarios')) return { rows: [{ id: params[0] }] };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('tstzrange')) return { rows: [{ id: 99 }] };
      throw new Error(`SQL não esperado: ${sql}`);
    },
  });
  try {
    const result = await request(server, '/os', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenGestor}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: 1,
        tecnico_id: 7,
        tipo_servico: 'LIMPEZA',
        descricao_problema: 'Limpeza completa agendada',
        agendado_para: '2026-10-20T14:00:00-03:00',
        duracao_prevista_minutos: 120,
      }),
    });
    assert.equal(result.status, 409);
    assert.match(result.body.erro, /O\.S\. #99/);
  } finally { db.query = originalQuery; db.transaction = originalTransaction; }
});

test('alteração de senha exige autenticação e senha forte', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const semToken = await request(server, '/conta/senha', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    assert.equal(semToken.status, 401);
    const fraca = await request(server, '/conta/senha', {
      method:'POST', headers:{Authorization:`Bearer ${tokenGestor}`,'Content-Type':'application/json'},
      body:JSON.stringify({ senha_atual:'123456', nova_senha:'abcdefgh' }),
    });
    assert.equal(fraca.status, 400);
  } finally { db.query = originalQuery; }
});

test('Meta consegue validar o webhook do WhatsApp', async () => {
  const result = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=token-webhook-teste&hub.challenge=123456`);
  assert.equal(result.status, 200);
  assert.equal(await result.text(), '123456');
});

test('conversas do WhatsApp exigem autenticação', async () => {
  const result = await request(server, '/atendimento/whatsapp/conversas');
  assert.equal(result.status, 401);
});

test('robô do WhatsApp apresenta as duas opções no primeiro contato', () => {
  const resposta = WhatsAppBotService.decidir('INICIO', 'Olá');
  assert.match(resposta.texto, /1 - Já sou cliente/);
  assert.match(resposta.texto, /2 - Ainda não sou cliente/);
  assert.equal(resposta.proximaEtapa, 'AGUARDANDO_TIPO');
});

test('robô identifica cliente e encaminha novo contato', () => {
  const cliente = WhatsAppBotService.decidir('AGUARDANDO_TIPO', '1', 'Maria');
  assert.match(cliente.texto, /Maria/);
  assert.equal(cliente.proximaEtapa, 'ATENDIMENTO_CLIENTE');
  const novo = WhatsAppBotService.decidir('AGUARDANDO_TIPO', '2');
  assert.match(novo.texto, /Informe seu nome/);
  assert.equal(novo.proximaEtapa, 'NOVO_CONTATO');
});

test('WhatsApp normaliza o nono dígito de celular brasileiro', () => {
  assert.equal(WhatsAppService._formatarNumero('558488986845'), '5584988986845');
  assert.equal(WhatsAppService._formatarNumero('5584988986845'), '5584988986845');
});

test('atendente assume conversa de forma vinculada ao próprio usuário', async () => {
  const originalQuery = db.query;
  const originalEnviar = WhatsAppService.enviarMensagem;
  WhatsAppService.enviarMensagem = async (_telefone, texto) => ({ messages: [{ id: `wamid.${texto.length}` }] });
  db.query = async (sql, params) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    if (sql.includes("fila_status='ATENDENDO'")) {
      assert.deepEqual(params, [2, '15', 3]);
      return { rows: [{ id: 15, telefone: '5584999999999', fila_status: 'ATENDENDO', atendente_id: 2, bot_ativo: false }] };
    }
    if (sql.includes('SELECT nome FROM usuarios')) return { rows: [{ nome: 'Carlos' }] };
    if (sql.includes('INSERT INTO whatsapp_mensagens')) { assert.match(params[2], /Carlos/); return { rows: [{ id: 30 }] }; }
    if (sql.includes('UPDATE whatsapp_conversas SET ultima_mensagem')) return { rows: [] };
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/atendimento/whatsapp/conversas/15/assumir', {
      method: 'POST', headers: { Authorization: `Bearer ${tokenGestor}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.atendente_id, 2);
    assert.equal(result.body.bot_ativo, false);
  } finally { db.query = originalQuery; WhatsAppService.enviarMensagem = originalEnviar; }
});

test('somente atendente responsável encerra a conversa', async () => {
  const originalQuery = db.query;
  const originalEnviar = WhatsAppService.enviarMensagem;
  WhatsAppService.enviarMensagem = async (_telefone, texto) => ({ messages: [{ id: `wamid.${texto.length}` }] });
  db.query = async (sql, params) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    if (sql.includes('SELECT * FROM whatsapp_conversas')) { assert.deepEqual(params, ['15', 3, 2]); return { rows: [{ id: 15, telefone: '5584999999999' }] }; }
    if (sql.includes('SELECT nome FROM usuarios')) return { rows: [{ nome: 'Carlos' }] };
    if (sql.includes('INSERT INTO whatsapp_mensagens')) { assert.match(params[2], /encerrado por Carlos/); return { rows: [{ id: 31 }] }; }
    if (sql.includes('encerrado_em=NOW()')) return { rows: [{ id: 15 }] };
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/atendimento/whatsapp/conversas/15/encerrar', {
      method: 'POST', headers: { Authorization: `Bearer ${tokenGestor}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.mensagem, 'Atendimento encerrado.');
  } finally { db.query = originalQuery; WhatsAppService.enviarMensagem = originalEnviar; }
});

test('técnico com acesso à agenda consegue carregar a lista de responsáveis', async () => {
  const originalQuery = db.query;
  db.query = async (sql, params) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    if (sql.includes('FROM usuarios')) {
      assert.deepEqual(params, [3]);
      return { rows: [{ id: 7, nome: 'Técnico', perfil: 'TECNICO' }] };
    }
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/tecnicos', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(result.status, 200);
    assert.equal(result.body[0].id, 7);
  } finally { db.query = originalQuery; }
});

test('gestor cadastra técnico somente na própria empresa', async () => {
  const originalQuery = db.query;
  let consultas = 0;
  db.query = async (sql, params) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    consultas += 1;
    // 1ª query: verifica se e-mail já existe
    if (sql.includes('SELECT id FROM usuarios')) return { rows: [] };
    // 2ª query: INSERT
    assert.match(sql, /INSERT INTO usuarios/);
    assert.equal(params[0], 3);
    assert.equal(params[1], 'Novo Técnico');
    assert.equal(params[2], 'novo@teste.com');
    assert.notEqual(params[3], 'senha123'); // deve ser o hash bcrypt
    return { rows: [{ id: 20, nome: params[1], email: params[2], perfil: 'TECNICO', ativo: true }] };
  };
  try {
    const result = await request(server, '/configuracoes/tecnicos', {
      method: 'POST', headers: { Authorization: `Bearer ${tokenGestor}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Novo Técnico', email: 'NOVO@TESTE.COM', senha: 'senha123' }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.tecnico.perfil, 'TECNICO');
    assert.equal(consultas, 2);
  } finally { db.query = originalQuery; }
});

test('usuário sem permissão não altera catálogo', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/catalogo/produtos/1', {
      method:'PATCH', headers:{ Authorization:`Bearer ${tokenRestrito}`, 'Content-Type':'application/json' }, body:'{}',
    });
    assert.equal(result.status, 403);
  } finally { db.query = originalQuery; }
});

test('usuário sem permissão não inativa cliente', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/clientes/1', {
      method:'DELETE', headers:{ Authorization:`Bearer ${tokenRestrito}` },
    });
    assert.equal(result.status, 403);
  } finally { db.query = originalQuery; }
});

test('cadastro de cliente rejeita CPF inválido', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  try {
    const result = await request(server, '/clientes', {
      method:'POST', headers:{ Authorization:`Bearer ${tokenGestor}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ nome:'Cliente Teste', cpf_cnpj:'111.111.111-11', quantidade_aparelhos:1 }),
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.erro, 'Dados inválidos.');
  } finally { db.query = originalQuery; }
});

test('cadastro de cliente normaliza contato e cria aparelhos vinculados', async () => {
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  let aparelhos = 0;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction = async (callback) => callback({ query:async(sql,params) => {
    if(sql.includes('INSERT INTO clientes')) {
      assert.equal(params[0],3); assert.equal(params[2],'84999998888'); assert.equal(params[3],'52998224725');
      return { rows:[{ id:44, nome:params[1] }] };
    }
    if(sql.includes('INSERT INTO aparelhos')) { aparelhos+=1; assert.equal(params[1],44); return { rows:[] }; }
    throw new Error(`SQL não esperado: ${sql}`);
  }});
  try {
    const result = await request(server, '/clientes', {
      method:'POST', headers:{ Authorization:`Bearer ${tokenGestor}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ nome:'Cliente Teste', telefone:'(84) 99999-8888', cpf_cnpj:'529.982.247-25', quantidade_aparelhos:2 }),
    });
    assert.equal(result.status,201); assert.equal(aparelhos,2);
  } finally { db.query = originalQuery; db.transaction = originalTransaction; }
});

test('gestor edita todos os dados comerciais do produto', async () => {
  const originalQuery = db.query;
  db.query = async (sql,params) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    assert.match(sql,/codigo_barras/); assert.match(sql,/fornecedor/); assert.match(sql,/localizacao/);
    assert.equal(params[0],'Compressor 12k'); assert.equal(params[2],'7891234567890');
    assert.equal(params[5],'Fornecedor Teste'); assert.equal(params[8],'A-03'); assert.equal(params[12],false);
    return { rows:[{ id:9,nome:params[0],ativo:params[12] }] };
  };
  try {
    const result=await request(server,'/catalogo/produtos/9',{method:'PATCH',headers:{Authorization:`Bearer ${tokenGestor}`,'Content-Type':'application/json'},body:JSON.stringify({nome:'Compressor 12k',sku:'COMP-12',codigo_barras:'7891234567890',descricao:'Compressor inverter',marca:'Marca X',fornecedor:'Fornecedor Teste',categoria:'Compressores',unidade:'UN',localizacao:'A-03',custo:500,preco:850,estoque_minimo:2,ativo:false})});
    assert.equal(result.status,200); assert.equal(result.body.ativo,false);
  } finally { db.query=originalQuery; }
});

test('PDF de orçamento é gerado em memória sem depender do disco', async () => {
  const pdf=await PdfService.gerarOrcamentoPdf({id:12,empresa_nome:'Clima Teste',cliente_nome:'Maria',cliente_telefone:'84999999999',subtotal:300,desconto:20,total:280,validade:'2026-12-31',observacoes:'Validade comercial',itens:[{descricao:'Limpeza completa',quantidade:2,valor_unitario:150}]});
  assert.ok(Buffer.isBuffer(pdf)); assert.equal(pdf.subarray(0,4).toString(),'%PDF'); assert.ok(pdf.length>500);
});

test('PDF da ordem é gerado em memória para armazenamento persistente', async () => {
  const pdf = await PdfService.gerarOsPdf({
    id: 10,
    empresa_nome: 'ClimaSaaS',
    tecnico_nome: 'Técnico',
    finalizado_em: new Date().toISOString(),
    cliente_nome: 'Cliente',
    cliente_endereco: 'Rua Teste',
    tipo_servico: 'LIMPEZA',
    descricao_problema: 'Limpeza preventiva',
    valor_total: 150,
    checklist: [],
    medicoes: {},
    itens: [],
  }, []);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});

test('recebimento de compra atualiza estoque com custo médio e registra movimento', async () => {
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  let custoNovo,movimento=false;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction=async callback=>callback({query:async(sql,params)=>{
    if(sql.includes('FROM compras'))return{rows:[{id:5,status:'PEDIDO'}]};
    if(sql.includes('FROM compra_itens'))return{rows:[{produto_id:9,quantidade:2,custo_unitario:200}]};
    if(sql.includes('SELECT estoque,custo'))return{rows:[{estoque:10,custo:100}]};
    if(sql.includes('UPDATE produtos')){custoNovo=params[1];return{rows:[]}};
    if(sql.includes('INSERT INTO estoque_movimentos')){movimento=true;return{rows:[]}};
    if(sql.includes('UPDATE compras'))return{rows:[]};
    throw new Error(`SQL não esperado: ${sql}`);
  }});
  try{
    const result=await request(server,'/compras/5/receber',{method:'POST',headers:{Authorization:`Bearer ${tokenGestor}`}});
    assert.equal(result.status,200);
    assert.ok(Math.abs(custoNovo-116.6666667)<.001);
    assert.equal(movimento,true);
  } finally { db.query=originalQuery; db.transaction=originalTransaction; }
});

test('reserva de material impede quantidade acima do saldo disponível', async () => {
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction=async callback=>callback({query:async(sql)=>{
    if(sql.includes('FROM ordens_servico'))return{rows:[{id:20,tecnico_id:7}]};
    if(sql.includes('FROM produtos'))return{rows:[{id:9,estoque:5}]};
    if(sql.includes('SUM(quantidade)'))return{rows:[{reservado:3}]};
    throw new Error(`SQL não esperado: ${sql}`);
  }});
  try{
    const result=await request(server,'/estoque/reservas',{method:'POST',headers:{Authorization:`Bearer ${tokenGestor}`,'Content-Type':'application/json'},body:JSON.stringify({os_id:20,produto_id:9,quantidade:3})});
    assert.equal(result.status,422);
    assert.match(result.body.erro,/Disponível para reserva: 2/);
  } finally { db.query=originalQuery; db.transaction=originalTransaction; }
});

// ─── Testes dos bugs corrigidos nesta rodada ──────────────────────────────────

test('Bug 8 — finalização retorna imediatamente sem aguardar PDF', async () => {
  // O cliente recebe a resposta com status FINALIZADA antes da geração do PDF.
  // pdf_url pode ser null na resposta imediata — o cliente deve buscar GET /os/:id.
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    // Consultas de PDF chamadas em background — não devem bloquear a resposta
    if (sql.includes('pdf_conteudo') || sql.includes('pdf_storage_key')) return { rows: [] };
    if (sql.includes('buscarDadosCompletosParaPdf')) return { rows: [] };
    if (sql.includes('FROM os_fotos')) return { rows: [] };
    if (sql.includes('FROM os_checklist')) return { rows: [] };
    if (sql.includes('FROM os_medicoes')) return { rows: [] };
    if (sql.includes('FROM os_itens')) return { rows: [] };
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction = async (callback) => callback({
    query: async (sql) => {
      // SELECT FOR UPDATE da OS (Bug 9)
      if (sql.includes('FOR UPDATE') && sql.includes('FROM ordens_servico')) return { rows: [{ id: 5, status: 'EM_ANDAMENTO', empresa_id: 3, tecnico_id: 7, diagnostico: 'ok', solucao_aplicada: 'ok', checkout_em: new Date() }] };
      if (sql.includes("tipo='ASSINATURA'")) return { rows: [{ id: 1 }] };
      if (sql.includes("tipo IN ('ANTES','DEPOIS','EVIDENCIA')")) return { rows: [{ total: 2 }] };
      if (sql.includes('os_checklist_respostas')) return { rows: [{ id: 1 }] };
      // baixa de estoque — sem peças nesta OS
      if (sql.includes('os_itens') && sql.includes('PECA')) return { rows: [] };
      if (sql.includes('UPDATE estoque_tecnico')) return { rows: [] };
      if (sql.includes('UPDATE produtos SET estoque')) return { rows: [] };
      if (sql.includes('INSERT INTO estoque_movimentos')) return { rows: [] };
      if (sql.includes('UPDATE os_itens SET estoque_baixado')) return { rows: [] };
      if (sql.includes('estoque_reservas')) return { rows: [] };
      if (sql.includes('UPDATE ordens_servico')) return { rows: [{ id: 5, status: 'FINALIZADA', empresa_id: 3, tecnico_id: 7, pdf_url: null }] };
      if (sql.includes('INSERT INTO fila_documentos')) return { rows: [] };
      if (sql.includes('INSERT INTO os_historico')) return { rows: [] };
      throw new Error(`SQL transação não esperado: ${sql}`);
    },
  });
  try {
    const inicio = Date.now();
    const result = await request(server, '/os/5/status', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ novo_status: 'FINALIZADA' }),
    });
    const duracao = Date.now() - inicio;
    // Resposta deve chegar em menos de 500ms (sem aguardar geração de PDF)
    assert.ok(duracao < 500, `Resposta demorou ${duracao}ms — PDF não deve bloquear`);
    assert.equal(result.status, 200);
    assert.equal(result.body.os.status, 'FINALIZADA');
  } finally { db.query = originalQuery; db.transaction = originalTransaction; }
});

test('Bug 9 — segunda finalização simultânea é rejeitada com 409', async () => {
  // Simula que a OS já foi finalizada por outra transação concorrente.
  // O SELECT FOR UPDATE retorna status=FINALIZADA, então a transição é inválida.
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction = async (callback) => callback({
    query: async (sql) => {
      // OS já está FINALIZADA quando o lock é adquirido
      if (sql.includes('FOR UPDATE') && sql.includes('FROM ordens_servico')) return { rows: [{ id: 6, status: 'FINALIZADA', empresa_id: 3, tecnico_id: 7 }] };
      throw new Error(`SQL transação não esperado: ${sql}`);
    },
  });
  try {
    const result = await request(server, '/os/6/status', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ novo_status: 'FINALIZADA' }),
    });
    assert.equal(result.status, 409);
    assert.match(result.body.erro, /FINALIZADA.*não permitida/i);
  } finally { db.query = originalQuery; db.transaction = originalTransaction; }
});

test('Bug 10 — segundo PAUSAR simultâneo é rejeitado com 409', async () => {
  // Simula que a OS já está pausada (pausado_em preenchido) quando o lock é adquirido.
  // O FOR UPDATE garante que a verificação de pausado_em é serializada.
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  db.query = async (sql) => {
    if (sql.includes(AUTH_MIDDLEWARE_SQL)) return authOk;
    throw new Error(`SQL não esperado: ${sql}`);
  };
  db.transaction = async (callback) => callback({
    query: async (sql) => {
      // OS está EM_ANDAMENTO mas já pausada
      if (sql.includes('FOR UPDATE') && sql.includes('FROM ordens_servico')) return { rows: [{ id: 7, status: 'EM_ANDAMENTO', empresa_id: 3, tecnico_id: 7, pausado_em: new Date() }] };
      throw new Error(`SQL transação não esperado: ${sql}`);
    },
  });
  try {
    const result = await request(server, '/os/7/eventos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento: 'PAUSAR', motivo: 'Aguardando peça' }),
    });
    assert.equal(result.status, 409);
    assert.match(result.body.erro, /não pode ser pausada/i);
  } finally { db.query = originalQuery; db.transaction = originalTransaction; }
});
