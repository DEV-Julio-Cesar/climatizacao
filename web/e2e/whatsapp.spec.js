import {test,expect} from '@playwright/test';
let ip=1;
test.beforeEach(async({context})=>context.setExtraHTTPHeaders({'X-Forwarded-For':`198.18.8.${ip++}`}));
async function entrar(page,conta='gestor-a'){
  await page.goto('/painel/#whatsapp');
  await page.getByLabel('E-mail',{exact:true}).fill(`${conta}@example.test`);await page.getByLabel('Senha',{exact:true}).fill('SenhaTeste123');
  await page.getByRole('button',{name:'Entrar no painel'}).click();
  await expect(page.getByRole('heading',{name:'WhatsApp',exact:true})).toBeVisible();
}
test('gestor configura e simula recepção completa sem criar conversa real',async({page})=>{
  await entrar(page);await page.getByRole('button',{name:'Configurar automação'}).click();
  await page.getByLabel('Nome do atendimento').fill('Recepção de teste');
  await page.getByLabel('Horário de atendimento (informativo)').fill('Segunda a sexta, das 8h às 18h');
  for(const texto of ['Olá','1','Ana','Natal, Tirol','Limpeza de dois aparelhos']){
    await page.getByLabel('Mensagem de teste',{exact:true}).fill(texto);
    const resposta=page.waitForResponse(r=>r.url().endsWith('/automacao/simular'));
    await page.getByRole('button',{name:'Simular mensagem',exact:true}).click();expect((await resposta).status()).toBe(200);
  }
  await expect(page.getByRole('status')).toHaveText('Encaminhado para a fila de espera.');
  await expect(page.getByLabel('Conversa simulada')).toContainText('Recepção de teste');
  await expect(page.getByLabel('Conversa simulada')).toContainText('Segunda a sexta');
  await page.getByRole('button',{name:'Salvar automação'}).click();await expect(page.getByRole('status').filter({hasText:'Configuração salva'})).toBeVisible();
  await page.getByRole('button',{name:'Voltar às conversas'}).click();
  await page.getByRole('button',{name:'Configurar automação'}).click();await expect(page.getByLabel('Nome do atendimento')).toHaveValue('Recepção de teste');
});
test('triagem, assumir sem envio e rascunhos isolados entre contatos',async({page})=>{
  await entrar(page);await page.getByRole('button',{name:/^Espera/}).click();
  await page.getByRole('button').filter({hasText:'Maria WhatsApp'}).click();
  await expect(page.getByText('Limpeza de dois aparelhos sintéticos',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Mensagem para o cliente')).toBeDisabled();
  await page.getByRole('button',{name:'Assumir atendimento'}).click();
  await expect(page.getByLabel('Mensagem para o cliente')).toBeEnabled();
  await expect(page.getByLabel('Mensagem para o cliente')).toHaveValue(/vou continuar seu atendimento/);
  await page.getByLabel('Mensagem para o cliente').fill('Rascunho exclusivo Maria');
  await expect(page.getByLabel('Histórico da conversa')).not.toContainText('vou continuar seu atendimento');
  await page.getByRole('button',{name:/^Espera/}).click();await page.getByRole('button').filter({hasText:'João WhatsApp'}).click();
  await page.getByRole('button',{name:'Assumir atendimento'}).click();
  await expect(page.getByLabel('Mensagem para o cliente')).toBeDisabled();
  await expect(page.getByLabel('Mensagem para o cliente')).not.toHaveValue('Rascunho exclusivo Maria');
  await expect(page.getByRole('button',{name:'Enviar',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:/^Atendendo/}).click();await page.getByRole('button').filter({hasText:'Maria WhatsApp'}).click();
  await expect(page.getByLabel('Mensagem para o cliente')).toHaveValue('Rascunho exclusivo Maria');
  await page.screenshot({path:'../tmp/whatsapp-central.png',fullPage:true});
});

test('visualização sem responder respeita permissões e layout no celular',async({page})=>{
  await page.setViewportSize({width:390,height:844});await entrar(page,'gestor-limitado');
  await page.getByRole('button',{name:/^Espera/}).click();await page.getByRole('button').filter({hasText:'Pedro WhatsApp'}).click();
  await expect(page.getByLabel('Histórico da conversa')).toContainText('Pedido sintético');
  await expect(page.getByLabel('Mensagem para o cliente')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Assumir atendimento'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Configurar automação'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'../tmp/whatsapp-mobile-web.png',fullPage:true});
});

test('resposta atrasada de outro contato não troca a conversa selecionada',async({page})=>{
  await entrar(page);let liberar,recebeu;const chegou=new Promise(resolve=>{recebeu=resolve;});
  await page.route('**/atendimento/whatsapp/conversas/*',async route=>{
    if(route.request().method()!=='GET')return route.continue();
    const resposta=await route.fetch(),dados=await resposta.json();
    if(dados.conversa?.nome_contato==='Maria WhatsApp'){
      const espera=new Promise(resolve=>{liberar=resolve;});recebeu();await espera;
    }await route.fulfill({response:resposta});
  });
  await page.getByRole('button',{name:/^Atendendo/}).click();await page.getByRole('button').filter({hasText:'Maria WhatsApp'}).click();await chegou;
  await page.getByRole('button').filter({hasText:'João WhatsApp'}).click();
  await expect(page.getByLabel('Histórico da conversa')).toContainText('Pedido sintético');liberar();
  await expect(page.locator('.wa-chat header b')).toHaveText('João WhatsApp');
});
