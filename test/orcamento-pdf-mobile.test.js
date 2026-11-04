const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function carregar(arquivo, deps, retorno) {
  const fonte = fs.readFileSync(arquivo, 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(deps), `${fonte}\nreturn ${retorno};`)(...Object.values(deps));
}

function criarApi(fetch) {
  const armazenado = new Map([['climasaas_token', 'antigo'], ['climasaas_refresh_token', 'refresh']]);
  const api = carregar('mobile/src/services/api.js', {
    Platform: { OS: 'android' },
    SecureStore: {
      getItemAsync: async k => armazenado.get(k),
      setItemAsync: async (k, v) => armazenado.set(k, v),
      deleteItemAsync: async k => armazenado.delete(k),
    },
    File: class {}, expoFetch: fetch, fetch,
  }, 'api');
  return { api, armazenado };
}

test('download de PDF renova sessão e preserva os bytes do documento', async () => {
  const chamadas = [];
  const { api, armazenado } = criarApi(async (url, options) => {
    chamadas.push({ url, options });
    if (url.endsWith('/auth/refresh')) return Response.json({ token: 'novo', refresh_token: 'refresh-novo' });
    if (options.headers.Authorization === 'Bearer antigo') return Response.json({ erro: 'Expirou' }, { status: 401 });
    return new Response('%PDF-1.7\nconteudo', { headers: { 'Content-Type': 'application/pdf' } });
  });
  const bytes = await api.baixarOrcamentoPdf(12);
  assert.equal(Buffer.from(bytes).toString(), '%PDF-1.7\nconteudo');
  assert.equal(chamadas.length, 3);
  assert.ok(chamadas[2].url.endsWith('/orcamentos/12/pdf'));
  assert.equal(chamadas[2].options.headers.Authorization, 'Bearer novo');
  assert.equal(armazenado.get('climasaas_refresh_token'), 'refresh-novo');
});

test('download não trata erros JSON, HTML ou arquivos inválidos como PDF', async () => {
  for (const [resposta, mensagem] of [
    [Response.json({ erro: 'Sem permissão.' }, { status: 403 }), /Sem permissão/],
    [Response.json({ erro: 'Não encontrado.' }, { status: 404 }), /Não encontrado/],
    [new Response('<html>erro</html>', { headers: { 'Content-Type': 'text/html' } }), /não retornou um PDF/],
    [new Response('erro', { headers: { 'Content-Type': 'application/pdf' } }), /PDF recebido está inválido/],
  ]) {
    const { api } = criarApi(async () => resposta);
    await assert.rejects(api.baixarOrcamentoPdf(12), mensagem);
  }
});

function criarExportacao({ cancelar = false, falharDownload = false, disponivel = true } = {}) {
  const escritos = [], compartilhados = [], pastas = [];
  let os = 'android';
  class Arquivo {
    constructor(...partes) { this.uri = partes.join('/'); }
    write(bytes) { escritos.push({ uri: this.uri, bytes }); }
  }
  const exportar = carregar('mobile/src/services/orcamentoPdf.js', {
    Platform: { get OS() { return os; } },
    Directory: { pickDirectoryAsync: async () => {
      pastas.push(true);
      if (cancelar) throw Object.assign(new Error('Cancelado'), { code: 'ERR_PICKER_CANCELLED' });
      return { createFile: (nome, mime) => { assert.equal(mime, 'application/pdf'); return new Arquivo('pasta', nome); } };
    } },
    File: Arquivo, Paths: { cache: 'cache' },
    Sharing: {
      isAvailableAsync: async () => disponivel,
      shareAsync: async (...args) => compartilhados.push(args),
    },
    api: { baixarOrcamentoPdf: async id => {
      assert.equal(id, 12);
      if (falharDownload) throw new Error('Sem conexão');
      return new Uint8Array([37, 80, 68, 70, 45]);
    } },
  }, 'exportarOrcamentoPdf');
  return { exportar, escritos, compartilhados, pastas, ios: () => { os = 'ios'; } };
}

test('Android salva na pasta escolhida e compartilha o arquivo PDF como anexo', async () => {
  const c = criarExportacao();
  assert.equal(await c.exportar(12, 'salvar'), true);
  assert.equal(c.pastas.length, 1);
  assert.match(c.escritos[0].uri, /^pasta\/orcamento_12_\d+\.pdf$/);
  assert.equal(c.compartilhados.length, 0);
  await c.exportar(12, 'compartilhar');
  assert.equal(c.pastas.length, 1);
  assert.equal(c.compartilhados[0][0], c.escritos[1].uri);
  assert.equal(c.compartilhados[0][1].mimeType, 'application/pdf');
});

test('cancelamento e falha de rede não deixam arquivos nem anunciam salvamento', async () => {
  const cancelado = criarExportacao({ cancelar: true });
  assert.equal(await cancelado.exportar(12, 'salvar'), false);
  assert.equal(cancelado.escritos.length, 0);
  const falha = criarExportacao({ falharDownload: true });
  await assert.rejects(falha.exportar(12, 'salvar'), /Sem conexão/);
  assert.equal(falha.escritos.length, 0);
  assert.equal(falha.pastas.length, 0);
});

test('iOS oferece salvar em Arquivos e aparelho sem compartilhamento recebe erro claro', async () => {
  const c = criarExportacao(); c.ios();
  assert.equal(await c.exportar(12, 'salvar'), false);
  assert.equal(c.pastas.length, 0);
  assert.equal(c.compartilhados[0][1].UTI, 'com.adobe.pdf');
  const indisponivel = criarExportacao({ disponivel: false });
  await assert.rejects(indisponivel.exportar(12, 'compartilhar'), /não está disponível/);
  assert.equal(indisponivel.escritos.length, 0);
});
