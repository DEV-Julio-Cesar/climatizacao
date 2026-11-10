const test = require('node:test');
const assert = require('node:assert/strict');
const { ambiente, carregar } = require('./helpers/offline');

test('SQLite inicializa, cria índice, isola contas e preserva itens sem dono', async () => {
  const env = ambiente(), { banco, adapter } = env;
  const sqlite = env.abrirSqlite();
  try {
    banco.exec("CREATE TABLE fila_sync(id INTEGER PRIMARY KEY AUTOINCREMENT,tipo TEXT NOT NULL,payload TEXT NOT NULL,client_uuid TEXT NOT NULL DEFAULT '',tentativas INTEGER NOT NULL DEFAULT 0,ultimo_erro TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP); INSERT INTO fila_sync(tipo,payload) VALUES('EVENTO_OS','{}');");
    await sqlite.initDB(); await sqlite.initDB();
    assert.ok(banco.prepare("SELECT name FROM sqlite_master WHERE name='ux_fila_tipo_uuid'").get());
    await sqlite.enfileirar('EVENTO_OS', { os_id: 1 });
    await sqlite.salvarCache('agenda', [{ id: 1 }]);
    env.conta = { id: 8, empresa_id: 4 };
    assert.deepEqual(await sqlite.listarFila(), []);
    assert.equal(await sqlite.lerCache('agenda'), null);
    await sqlite.enfileirar('EVENTO_OS', { os_id: 2 });
    env.conta = { id: 7, empresa_id: 3 };
    assert.equal(JSON.parse((await sqlite.listarFila())[0].payload).os_id, 1);
    assert.equal((await sqlite.lerCache('agenda')).dados[0].id, 1);
    assert.equal(banco.prepare("SELECT COUNT(*) AS total FROM fila_sync WHERE conta='legado'").get().total, 1);
    env.conta.perfil='GESTOR';
    const legado=await sqlite.listarFilaLegada();
    assert.equal(legado.length,1);
    assert.equal(await sqlite.assumirLegado([legado[0].id]),1);
    assert.equal((await sqlite.listarFila()).length,2);
    assert.equal(banco.prepare("SELECT COUNT(*) AS total FROM fila_sync WHERE conta='legado'").get().total,0);
    const circular={};circular.self=circular;
    await assert.rejects(sqlite.enfileirarLote([{tipo:'FOTO_OS',payload:{os_id:1}},{tipo:'EVENTO_OS',payload:circular}]));
    assert.equal((await sqlite.listarFila()).length,2,'rollback não deixa metade da finalização na fila');
    const ids=await sqlite.enfileirarLote([{tipo:'FOTO_OS',payload:{os_id:1,metadados:{assinante_nome:'Ana Souza'}}},{tipo:'EVENTO_OS',payload:{os_id:1,dados:{evento:'CHECKOUT'}}},{tipo:'STATUS_OS',payload:{os_id:1,novo_status:'FINALIZADA'}}]);
    assert.equal(ids.length,3);const lote=(await sqlite.listarFila()).filter(i=>ids.includes(i.id));
    assert.deepEqual(lote.map(i=>i.tipo),['FOTO_OS','EVENTO_OS','STATUS_OS']);assert.equal(JSON.parse(lote[0].payload).metadados.assinante_nome,'Ana Souza');
    let exclusiva=false;const run=adapter.runAsync;
    adapter.runAsync=async()=>{throw new Error('Gravação fora da conexão exclusiva');};
    adapter.withExclusiveTransactionAsync=async fn=>{exclusiva=true;await adapter.withTransactionAsync(()=>fn({runAsync:run}));};
    assert.equal((await sqlite.enfileirarLote([{tipo:'EVENTO_OS',payload:{os_id:1}}])).length,1);assert.equal(exclusiva,true);
    await assert.rejects(sqlite.enfileirarLote([],'outra:conta'),/conta mudou/);
  } finally { banco.close(); }
});

test('arquivo de foto só é removido depois da confirmação na fila local',async()=>{
  const item={id:1,tipo:'FOTO_OS',payload:JSON.stringify({os_id:5,tipo:'ASSINATURA',uri:'file:///assinatura.png',metadados:{assinante_nome:'Ana Souza'}}),tentativas:0};
  const itens=[item],ordem=[];let falhar=true;
  const sync=carregar('mobile/src/services/SyncService.js',['Network','listarFila','registrarFalha','removerFila','api','FileSystem','SecureStore','comFotoParaUpload'],[
    {getNetworkStateAsync:async()=>({isConnected:true})},async()=>itens,async()=>{},async()=>{if(falhar)throw new Error('SQLite ocupado');ordem.push('removerFila');itens.length=0;},
    {uploadFoto:async(_id,_tipo,_arquivo,meta)=>{assert.equal(meta.assinante_nome,'Ana Souza');return {};}},
    {deleteAsync:async()=>{ordem.push('removerArquivo');}},{getItemAsync:async()=> 'conta'},async(uri,fn)=>fn(uri),
  ],'tentarSincronizarOffline');
  await sync.tentarSincronizarOffline();assert.deepEqual(ordem,[]);assert.equal(itens.length,1);
  falhar=false;await sync.tentarSincronizarOffline();assert.deepEqual(ordem,['removerFila','removerArquivo']);assert.equal(itens.length,0);
});

test('fila preserva operação após cinco falhas, bloqueia dependentes e permite reenvio manual', async () => {
  const itens = [{ id: 1, tipo: 'EVENTO_OS', payload: JSON.stringify({ os_id: 1, dados: { evento: 'CHECKIN' } }), tentativas: 0 }, { id: 2, tipo: 'STATUS_OS', payload: JSON.stringify({ os_id: 1, novo_status: 'FINALIZADA' }), tentativas: 0 }];
  let falhar = true, chamadas = 0;
  const sync = carregar('mobile/src/services/SyncService.js', ['Network', 'listarFila', 'registrarFalha', 'removerFila', 'api', 'FileSystem', 'SecureStore'], [
    { getNetworkStateAsync: async () => ({ isConnected: true }) }, async () => itens,
    async id => { itens.find(i => i.id === id).tentativas++; }, async id => { itens.splice(itens.findIndex(i => i.id === id), 1); },
    { chamadaAutenticada: async () => { chamadas++; if (falhar) throw Object.assign(new Error('Indisponível'), { status: 503 }); } }, {}, { getItemAsync: async () => 'conta-3-7' },
  ], 'tentarSincronizarOffline');
  for (let i = 0; i < 6; i++) await sync.tentarSincronizarOffline();
  assert.equal(itens.length, 2); assert.equal(itens[0].tentativas, 5); assert.equal(chamadas, 5);
  falhar = false;
  assert.equal((await sync.tentarSincronizarOffline(1)).enviados, 1);
  assert.equal((await sync.tentarSincronizarOffline()).enviados, 1);
  assert.equal(itens.length, 0);
});
