const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ambiente } = require('./helpers/offline');

function legado(env) {
  env.banco.exec(`CREATE TABLE fila_sync(id INTEGER PRIMARY KEY AUTOINCREMENT,tipo TEXT NOT NULL,payload TEXT NOT NULL,client_uuid TEXT NOT NULL DEFAULT '',tentativas INTEGER NOT NULL DEFAULT 0,ultimo_erro TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,conta TEXT NOT NULL DEFAULT 'legado');
    CREATE TABLE cache_dados(chave TEXT PRIMARY KEY,valor TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP); PRAGMA user_version=3;`);
}
function adulterar(valor) {
  const i = valor.indexOf(':') + 1;
  const data = Buffer.from(valor.slice(i), 'base64'); data[data.length - 1] ^= 1;
  return valor.slice(0, i) + data.toString('base64');
}

test('cofre: AES-GCM usa nonce diferente e rejeita conteúdo adulterado ou contexto diferente', async () => {
  const e = ambiente();
  try {
    await Promise.all([e.cofre.inicializarCofre(false), e.cofre.inicializarCofre(false)]);
    assert.equal(e.acoes.filter(a => a[0] === 'chave').length, 1);
    assert.equal(e.acoes.find(a => a[0] === 'chave')[1].keychainAccessible, 'device-only');
    const texto = 'Cliente José, CPF e endereço confidenciais';
    const a = await e.cofre.cifrarTexto(texto, 'conta-a'), b = await e.cofre.cifrarTexto(texto, 'conta-a');
    assert.notEqual(a, b); assert.ok(!a.includes('confidenciais'));
    assert.equal(await e.cofre.decifrarTexto(a, 'conta-a'), texto);
    await assert.rejects(e.cofre.decifrarTexto(a, 'conta-b'), /registro foi preservado/);
    await assert.rejects(e.cofre.decifrarTexto(adulterar(a), 'conta-a'), /registro foi preservado/);
    await assert.rejects(e.cofre.decifrarTexto(texto, 'conta-a'), /sem proteção/);
  } finally { e.banco.close(); }
});

test('migração protege conteúdo e fotos antigos e só remove originais após commit', async () => {
  const e = ambiente(); legado(e);
  const origem = 'file:///documents/os_1.jpg', base64 = 'aW1hZ2VtLWNvbmZpZGVuY2lhbA==';
  e.arquivos.set(origem, base64);
  e.banco.prepare('INSERT INTO fila_sync(tipo,payload,ultimo_erro) VALUES(?,?,?)').run('FOTO_OS', JSON.stringify({ os_id: 1, uri: origem }), 'Nome pessoal em mensagem antiga');
  e.banco.prepare('INSERT INTO cache_dados(chave,valor) VALUES(?,?)').run('3:7:agenda', JSON.stringify([{ nome: 'Cliente confidencial' }]));
  const transacaoOriginal = e.adapter.withTransactionAsync;
  e.adapter.withTransactionAsync = async fn => {
    e.banco.exec('BEGIN');
    try { await fn(); assert.ok(e.arquivos.has(origem), 'origem deve existir até o commit'); e.banco.exec('COMMIT'); }
    catch (error) { e.banco.exec('ROLLBACK'); throw error; }
  };
  try {
    const sqlite = e.abrirSqlite(); await sqlite.initDB();
    e.adapter.withTransactionAsync = transacaoOriginal;
    const bruto = e.banco.prepare('SELECT * FROM fila_sync').get();
    assert.ok(e.cofre.estaCifrado(bruto.payload)); assert.ok(e.cofre.estaCifrado(bruto.ultimo_erro));
    assert.ok(e.cofre.estaCifrado(e.banco.prepare('SELECT valor FROM cache_dados').get().valor));
    e.conta.perfil = 'GESTOR';
    const fila = await sqlite.listarFilaLegada(), dados = JSON.parse(fila[0].payload);
    assert.ok(e.fotos.arquivoProtegido(dados.uri)); assert.ok(!e.arquivos.has(origem));
    assert.ok(!e.arquivos.get(dados.uri).includes(base64));
    assert.equal((await sqlite.lerCache('agenda')).dados[0].nome, 'Cliente confidencial');
    assert.equal(e.banco.prepare('SELECT COUNT(*) total FROM offline_limpeza').get().total, 0);
    assert.equal(await sqlite.assumirLegado([bruto.id]), 1);
    assert.equal(JSON.parse((await sqlite.listarFila())[0].payload).os_id, 1);
    const reaberto = e.abrirSqlite(); await reaberto.initDB();
    assert.equal(JSON.parse((await reaberto.listarFila())[0].payload).os_id, 1);
    assert.equal((await reaberto.lerCache('agenda')).dados[0].nome, 'Cliente confidencial');
    assert.equal(e.arquivos.size, 1, 'reinicialização não duplica a evidência cifrada');
  } finally { e.banco.close(); }
});

test('migração interrompida preserva fila/original e remove apenas novas cópias; pode ser repetida', async () => {
  const e = ambiente(); legado(e);
  const origem = 'file:///documents/assinatura.png'; e.arquivos.set(origem, 'YXNzaW5hdHVyYQ==');
  const original = JSON.stringify({ uri: origem, os_id: 1 });
  e.banco.prepare('INSERT INTO fila_sync(tipo,payload) VALUES(?,?)').run('FOTO_OS', original);
  e.banco.prepare('INSERT INTO fila_sync(tipo,payload) VALUES(?,?)').run('FOTO_OS', 'json-invalido');
  try {
    const sqlite = e.abrirSqlite(); await assert.rejects(sqlite.initDB());
    assert.equal(e.banco.prepare('SELECT payload FROM fila_sync WHERE id=1').get().payload, original);
    assert.ok(e.arquivos.has(origem)); assert.equal(e.arquivos.size, 1);
    assert.equal(e.banco.prepare("SELECT valor FROM offline_config WHERE chave='crypto_v1'").get(), undefined);
    e.banco.exec("UPDATE fila_sync SET tipo='EVENTO_OS',payload='{}' WHERE id=2");
    await sqlite.initDB(); assert.ok(!e.arquivos.has(origem));
    assert.equal(e.banco.prepare('SELECT COUNT(*) total FROM fila_sync').get().total, 2);
  } finally { e.banco.close(); }
});

test('perda de chave bloqueia leitura e gravação sem gerar outra chave ou apagar pendências', async () => {
  const e = ambiente();
  try {
    let sqlite = e.abrirSqlite(); await sqlite.initDB(); await sqlite.enfileirar('EVENTO_OS', { os_id: 7 });
    const original = e.banco.prepare('SELECT payload FROM fila_sync').get().payload;
    e.segredos.clear(); sqlite = e.abrirSqlite();
    await assert.rejects(sqlite.initDB(), /Não desinstale/);
    await assert.rejects(sqlite.enfileirar('EVENTO_OS', { os_id: 8 }));
    assert.equal(e.segredos.size, 0); assert.equal(e.banco.prepare('SELECT payload FROM fila_sync').get().payload, original);
  } finally { e.banco.close(); }
});

test('conteúdo de fila/cache não pode ser movido para outra conta sem falhar a autenticação', async () => {
  const e = ambiente();
  try {
    const sqlite = e.abrirSqlite(); await sqlite.initDB();
    await sqlite.enfileirar('EVENTO_OS', { os_id: 7 }); await sqlite.salvarCache('agenda', { segredo: 'cliente-a' });
    await sqlite.registrarFalha(1, 'Erro contendo nome de cliente');
    assert.equal((await sqlite.listarFila())[0].ultimo_erro, 'Erro contendo nome de cliente');
    const item = e.banco.prepare('SELECT * FROM fila_sync').get();
    e.banco.prepare('UPDATE fila_sync SET conta=?').run('4:8'); e.conta = { id: 8, empresa_id: 4 };
    await assert.rejects(sqlite.listarFila(), /registro foi preservado/);
    e.banco.exec("UPDATE cache_dados SET chave=replace(chave,'3:7:','4:8:')");
    await assert.rejects(sqlite.lerCache('agenda'), /registro foi preservado/);
    assert.equal(e.banco.prepare('SELECT payload FROM fila_sync').get().payload, item.payload);
    e.banco.exec("UPDATE fila_sync SET conta='3:7'");
    await assert.rejects(sqlite.removerFila(item.id), /Evidência preservada/);
    assert.equal(e.banco.prepare('SELECT COUNT(*) total FROM fila_sync').get().total, 1);
  } finally { e.banco.close(); }
});

test('upload decifra somente em cache privado e limpa temporário em sucesso ou falha', async () => {
  const e = ambiente();
  try {
    await e.cofre.inicializarCofre(false);
    const base64 = 'YXNzaW5hdHVyYS1jbGllbnRl', uri = await e.fotos.guardarBase64(base64);
    let destino;
    await assert.rejects(e.fotos.comFotoParaUpload(uri, async temporario => {
      destino = temporario; assert.ok(temporario.startsWith('file:///cache/climasaas-upload/'));
      assert.ok(temporario.endsWith('.png')); assert.equal(e.arquivos.get(temporario), base64);
      throw new Error('Rede indisponível');
    }, 'image/png'), /Rede/);
    assert.ok(!e.arquivos.has(destino)); assert.ok(e.arquivos.has(uri));
    assert.equal(await e.fotos.comFotoParaUpload(uri, async temporario => { destino = temporario; return 'ok'; }), 'ok');
    assert.ok(!e.arquivos.has(destino)); assert.ok(e.arquivos.has(uri));
    e.arquivos.set('file:///cache/climasaas-upload/abandonado.png', base64);
    e.arquivos.set('file:///cache/outro-arquivo.pdf', 'outro');
    await e.fotos.limparTemporariosUpload();
    assert.ok(!e.arquivos.has('file:///cache/climasaas-upload/abandonado.png'));
    assert.equal(e.arquivos.get('file:///cache/outro-arquivo.pdf'), 'outro');
    e.arquivos.set(uri, adulterar(e.arquivos.get(uri)));
    await assert.rejects(e.fotos.comFotoParaUpload(uri, () => assert.fail('Não deve enviar imagem adulterada')), /registro foi preservado/);
  } finally { e.banco.close(); }
});

test('cofre rejeita caminho externo, travessia e referência remota sem remover arquivos', async () => {
  const e = ambiente();
  try {
    for (const uri of ['https://exemplo.com/foto.jpg', 'file:///documents/../externo.jpg', 'file://outro-host/documents/foto.jpg', 'file:///documents/', 'file:///documents/%2f..%2fexterno.jpg']) {
      await assert.rejects(e.fotos.guardarFoto(uri), /fora do armazenamento/);
      await assert.rejects(e.fotos.removerArquivoPrivado(uri), /fora do aplicativo/);
    }
    assert.equal(e.acoes.length, 0);
  } finally { e.banco.close(); }
});

test('migração compacta SQLite e não deixa marcador pessoal nos bytes do arquivo', async () => {
  const pasta = fs.mkdtempSync(path.join(process.cwd(), 'tmp', 'offline-cifra-'));
  const arquivo = path.join(pasta, 'offline.db'), e = ambiente(arquivo);
  try {
    legado(e);
    const marcador = 'CLIENTE_CONFIDENCIAL_123456789';
    e.banco.prepare('INSERT INTO fila_sync(tipo,payload) VALUES(?,?)').run('EVENTO_OS', JSON.stringify({ nome: marcador }));
    e.banco.prepare('INSERT INTO cache_dados(chave,valor) VALUES(?,?)').run(`3:7:agenda_${marcador}`, '{}');
    await e.abrirSqlite().initDB();
    assert.match(e.banco.prepare('SELECT chave FROM cache_dados').get().chave, /^3:7:h1:[a-f0-9]{64}$/);
    assert.ok(!fs.readFileSync(arquivo).includes(Buffer.from(marcador)));
    for (const suffix of ['-wal', '-shm']) if (fs.existsSync(arquivo + suffix)) assert.ok(!fs.readFileSync(arquivo + suffix).includes(Buffer.from(marcador)));
  } finally {
    e.banco.close();
    // Somente os arquivos conhecidos deste diretório criado pelo próprio teste.
    for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(arquivo + suffix)) fs.unlinkSync(arquivo + suffix);
    fs.rmdirSync(pasta);
  }
});

test('limpeza de cache é restrita à conta e bloqueada enquanto houver fila pendente', async () => {
  const e = ambiente();
  try {
    const sqlite = e.abrirSqlite(); await sqlite.initDB();
    await sqlite.salvarCache('agenda', { os: 1 });
    e.conta = { id: 70, empresa_id: 3 }; await sqlite.salvarCache('agenda', { os: 70 });
    e.conta = { id: 7, empresa_id: 3 };
    await sqlite.enfileirar('EVENTO_OS', { os_id: 1 });
    await assert.rejects(sqlite.limparCacheDaConta(), /Sincronize os atendimentos pendentes/);
    assert.equal((await sqlite.lerCache('agenda')).dados.os, 1);
    await sqlite.removerFila(1);
    assert.equal((await sqlite.limparCacheDaConta()).removidos, 1);
    assert.equal(await sqlite.lerCache('agenda'), null);
    e.conta = { id: 70, empresa_id: 3 }; assert.equal((await sqlite.lerCache('agenda')).dados.os, 70);
  } finally { e.banco.close(); }
});

test('falha na remoção do original após commit deixa limpeza registrada para o próximo boot', async () => {
  const e = ambiente(); legado(e);
  const origem = 'file:///documents/antiga.jpg'; e.arquivos.set(origem, 'Zm90bw==');
  e.banco.prepare('INSERT INTO fila_sync(tipo,payload) VALUES(?,?)').run('FOTO_OS', JSON.stringify({ uri: origem }));
  const remover = e.FileSystem.deleteAsync; let bloquear = true;
  e.FileSystem.deleteAsync = async uri => { if (uri === origem && bloquear) throw new Error('Arquivo ocupado'); return remover(uri); };
  try {
    const sqlite = e.abrirSqlite(); await assert.rejects(sqlite.initDB(), /ocupado/);
    assert.ok(e.cofre.estaCifrado(e.banco.prepare('SELECT payload FROM fila_sync').get().payload));
    assert.equal(e.banco.prepare('SELECT uri FROM offline_limpeza').get().uri, origem);
    assert.ok(e.arquivos.has(origem)); bloquear = false;
    await sqlite.initDB(); assert.ok(!e.arquivos.has(origem));
    assert.equal(e.banco.prepare('SELECT COUNT(*) total FROM offline_limpeza').get().total, 0);
  } finally { e.banco.close(); }
});
