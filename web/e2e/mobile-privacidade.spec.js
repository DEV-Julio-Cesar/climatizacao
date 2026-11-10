import { test,expect } from '@playwright/test';
let ipTeste=1;
test.beforeEach(async({context})=>context.setExtraHTTPHeaders({'X-Forwarded-For':`198.18.1.${ipTeste++}`}));
async function entrar(page,conta='tecnico-a',tema='claro') {
  await page.setViewportSize({width:390,height:844});await page.goto(`/homologacao-mobile/?tema=${tema}`);
  await page.getByLabel('Conta sintética').selectOption(conta);
  const lista=page.waitForResponse(r=>r.url().includes('/privacidade/solicitacoes')&&r.request().method()==='GET');
  await page.getByRole('button',{name:'Entrar no teste mobile'}).click();
  expect((await lista).status()).toBe(200);
  await expect(page.getByText('Seus dados e solicitações',{exact:true})).toBeVisible();
  await expect(page.getByText('Nova solicitação',{exact:true})).toBeVisible();
}
test('componente mobile cria pedido e abre resposta/histórico sem depender de APK',async({page})=>{
  await entrar(page);await page.getByRole('button',{name:'Nova solicitação'}).click();
  await page.getByLabel('Descrição da solicitação').fill('Pedido criado pelo componente mobile no teste visual');
  await page.getByRole('button',{name:'Registrar e gerar protocolo'}).click();
  await expect(page.getByText(/^Protocolo [0-9a-f-]+\. Guarde/)).toBeVisible();
  await page.getByText('Pedido criado pelo componente mobile no teste visual',{exact:true}).click();
  await expect(page.getByText('Acompanhar solicitação',{exact:true})).toBeVisible();
  await expect(page.getByText('Histórico de andamentos',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Resposta da solicitação')).toHaveCount(0);
});
test('componente mobile mantém chave e formulário quando a resposta do envio se perde',async({page})=>{
  await entrar(page);let primeira=true;const chaves=[];
  await page.route('**/privacidade/solicitacoes',async route=>{
    if(route.request().method()!=='POST')return route.continue();chaves.push(route.request().headers()['idempotency-key']);
    if(primeira){primeira=false;await route.fetch();return route.abort('connectionreset');}return route.continue();
  });
  await page.getByRole('button',{name:'Nova solicitação'}).click();
  await page.getByLabel('Descrição da solicitação').fill('Pedido mobile com falha simulada de confirmação');
  await page.getByRole('button',{name:'Registrar e gerar protocolo'}).click();
  await expect(page.getByText(/consulte os protocolos antes de iniciar outro pedido/)).toBeVisible();
  await expect(page.getByLabel('Descrição da solicitação')).toHaveValue('Pedido mobile com falha simulada de confirmação');
  await page.getByRole('button',{name:'Registrar e gerar protocolo'}).click();
  await expect(page.getByText(/^Protocolo [0-9a-f-]+\. Guarde/)).toBeVisible();expect(chaves).toHaveLength(2);expect(chaves[1]).toBe(chaves[0]);
});
test('componente mobile respeita permissão de cliente e renderiza tema escuro',async({page},testInfo)=>{
  await entrar(page,'gestor-limitado','escuro');await page.getByRole('button',{name:'Nova solicitação'}).click();
  await expect(page.getByLabel('Número do cliente')).toHaveCount(0);
  await expect(page.getByText('Pedido restrito de cliente sintético',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('privacidade-mobile-escuro.png')});
});
