import { test, expect } from '@playwright/test';

const senha = 'SenhaTeste123';
const protocoloHistorico = '00000000-0000-4000-8000-000000000001';
let ipTeste = 1;
test.beforeEach(async({context})=>context.setExtraHTTPHeaders({'X-Forwarded-For':`198.18.2.${ipTeste++}`}));
async function entrar(page, conta = 'tecnico-a') {
  await page.goto('/painel/#conta');
  await page.getByLabel('E-mail', { exact: true }).fill(`${conta}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar no painel' }).click();
  await expect(page.getByRole('heading', { name: 'Privacidade', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar e gerar protocolo' })).toBeEnabled();
}
async function filtrar(page, protocolo) {
  await page.getByLabel('Protocolo completo').fill(protocolo);
  const resposta=page.waitForResponse(r=>r.url().includes('/privacidade/solicitacoes?')&&new URL(r.url()).searchParams.get('protocolo')===protocolo);
  await page.getByRole('button', { name: 'Buscar protocolo' }).click();
  expect((await resposta).status()).toBe(200);
  await expect(page.getByText('Carregando protocolos...', { exact: true })).toBeHidden();
  await expect(page.getByRole('article').filter({hasNotText:protocolo})).toHaveCount(0);
}
async function token(request, conta) {
  const r = await request.post('/login',{data:{email:`${conta}@example.test`,senha,cliente:'mobile'}});
  expect(r.status()).toBe(200);return (await r.json()).token;
}

test('login, sessão restaurada por cookie e resumo sem credenciais em localStorage', async ({ page }) => {
  await entrar(page);
  for(const label of ['Senha atual','Nova senha','Confirmar nova senha'])await expect(page.getByLabel(label,{exact:true})).toHaveAttribute('type','password');
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/token|usuario/.test(k)))).toEqual([]);
  await page.reload();await expect(page.getByRole('heading',{name:'Privacidade',exact:true})).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar primeira página (JSON)'}).click();
  expect((await download).suggestedFilename()).toBe('resumo-conta-0.json');
  await expect(page.getByText('Última página do resumo baixada.',{exact:false})).toBeVisible();
});

test('resposta perdida mantém pedido e chave: reenviar devolve o mesmo protocolo', async ({ page }) => {
  await entrar(page);let perdido=false,protocolo;const chaves=[];
  await page.route('**/privacidade/solicitacoes',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    chaves.push(route.request().headers()['idempotency-key']);
    if(!perdido){perdido=true;const result=await route.fetch();expect(result.status()).toBe(201);protocolo=(await result.json()).protocolo;return route.abort('connectionreset');}
    return route.continue();
  });
  await page.getByLabel('Descrição',{exact:true}).fill('Pedido para testar resposta perdida na conexão');
  await page.getByRole('button',{name:'Registrar e gerar protocolo'}).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await page.getByRole('button',{name:'Registrar e gerar protocolo'}).click();
  await expect(page.getByRole('status').filter({hasText:protocolo})).toBeVisible();
  expect(chaves).toHaveLength(2);expect(chaves[0]).toBeTruthy();expect(chaves[1]).toBe(chaves[0]);
});

test('gestor inicia análise, consulta histórico e conclui pedido com resposta', async ({ page, request }) => {
  const bearer=await token(request,'outro-tecnico');
  const r=await request.post('/privacidade/solicitacoes',{headers:{Authorization:`Bearer ${bearer}`},data:{tipo:'CORRECAO',descricao:'Corrigir o cadastro conforme solicitação de teste'}});
  expect(r.status()).toBe(201);const {protocolo}=await r.json();
  await entrar(page,'gestor-a');await filtrar(page,protocolo);
  await page.getByLabel('Andamento ou resposta',{exact:false}).fill('Iniciamos a conferência das informações do cadastro.');
  await page.getByRole('button',{name:'Iniciar análise'}).click();
  await expect(page.getByRole('button',{name:'Concluir com resposta'})).toBeVisible();
  await page.getByRole('button',{name:'Ver histórico completo'}).click();
  const historico=page.getByRole('region',{name:'Histórico da solicitação'});
  await expect(historico).toContainText('Iniciamos a conferência');
  await page.getByLabel('Andamento ou resposta',{exact:false}).fill('Cadastro conferido e resposta disponibilizada ao solicitante.');
  await page.getByRole('button',{name:'Concluir com resposta'}).click();
  await expect(page.getByText('Cadastro conferido e resposta disponibilizada ao solicitante.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Concluir com resposta'})).toHaveCount(0);
});

test('gestor sem permissão de clientes não vê o campo nem o pedido restrito', async ({ page, request }) => {
  await entrar(page,'gestor-limitado');
  await expect(page.getByLabel('Número do cliente',{exact:false})).toHaveCount(0);
  await filtrar(page,'00000000-0000-4000-8000-000000000002');
  await expect(page.getByText('Nenhuma solicitação para os filtros selecionados.')).toBeVisible();
  const bearer=await token(request,'gestor-limitado');
  const r=await request.get('/privacidade/solicitacoes/00000000-0000-4000-8000-000000000002',{headers:{Authorization:`Bearer ${bearer}`}});expect(r.status()).toBe(404);
});

test('histórico pagina, recupera falha e preserva andamentos sem duplicar', async ({ page }) => {
  await entrar(page);await filtrar(page,protocoloHistorico);
  await page.getByRole('button',{name:'Ver histórico completo'}).click();
  const history=page.getByRole('region',{name:'Histórico da solicitação'});
  await expect(history.locator('li')).toHaveCount(50);
  let falhou=false;
  await page.route('**/privacidade/solicitacoes/*?cursor=*',async route=>{
    if(new URL(route.request().url()).searchParams.get('cursor')!=='0'&&!falhou){falhou=true;return route.fulfill({status:503,json:{erro:'Falha temporária do histórico'}});}return route.continue();
  });
  await history.getByRole('button',{name:'Carregar mais andamentos'}).click();
  await expect(history.getByRole('alert')).toContainText('Falha temporária');
  await history.getByRole('button',{name:'Tentar novamente'}).click();
  await expect(history.locator('li')).toHaveCount(55);
  await expect(history.getByRole('button',{name:'Carregar mais andamentos'})).toHaveCount(0);
});

test('falha de filtro antigo não substitui o resultado mais recente', async ({ page }) => {
  await entrar(page);let liberar;let interceptado;
  const chegou=new Promise(resolve=>{interceptado=resolve;});
  const aguardar=new Promise(resolve=>{liberar=resolve;});
  await page.route('**/privacidade/solicitacoes?*',async route=>{
    if(new URL(route.request().url()).searchParams.get('status')==='RECEBIDA'){
      interceptado();await aguardar;return route.fulfill({status:503,json:{erro:'Falha da consulta antiga'}});
    }return route.continue();
  });
  await page.getByLabel('Situação',{exact:true}).selectOption('RECEBIDA');await chegou;
  await page.getByLabel('Situação',{exact:true}).selectOption('CONCLUIDA');
  await expect(page.getByText('Carregando protocolos...')).toBeHidden();liberar();
  await page.waitForResponse(r=>r.url().includes('status=RECEBIDA')&&r.status()===503);
  await expect(page.getByText('Falha da consulta antiga')).toHaveCount(0);
});

test('layout de privacidade permite uso em viewport de celular sem rolagem horizontal', async ({ page }, testInfo) => {
  await page.setViewportSize({width:390,height:844});await entrar(page,'gestor-a');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByLabel('Descrição',{exact:true}).fill('Conferência visual do formulário em tela estreita.');
  await page.getByRole('heading',{name:'Privacidade',exact:true}).evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-20));
  await page.screenshot({path:testInfo.outputPath('privacidade-web-celular.png')});
});

test('desativação exige senha correta e encerra acesso à conta de teste', async ({ page }) => {
  await entrar(page,'desativar');
  await page.getByLabel('Confirme sua senha atual').fill('SenhaIncorreta123');
  await page.getByRole('checkbox',{name:'Entendo o alcance'}).check();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Desativar minha conta'}).click();
  await expect(page.getByRole('alert')).toContainText('Senha atual inválida');
  await page.getByLabel('Confirme sua senha atual').fill(senha);
  await page.getByRole('button',{name:'Desativar minha conta'}).click();
  await expect(page.getByRole('button',{name:'Entrar no painel'})).toBeVisible();
});
