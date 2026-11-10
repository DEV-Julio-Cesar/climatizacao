// Servidor exclusivo de homologação. Nunca carrega .env nem inicia workers.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.TEST_DATABASE_URL) throw new Error('Defina TEST_DATABASE_URL para um PostgreSQL de testes isolado. DATABASE_URL não é utilizada.');
const base = new URL(process.env.E2E_BASE_URL || 'http://127.0.0.1:4173');
if (base.hostname !== '127.0.0.1' || base.protocol !== 'http:') throw new Error('Homologação aceita somente HTTP em 127.0.0.1.');
const schema = `e2e_${crypto.randomBytes(10).toString('hex')}`;
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
let server, db, encerrando = false;

async function encerrar() {
  if (encerrando) return; encerrando = true;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (db) await db.pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
async function main() {
  await admin.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const connection = new URL(process.env.TEST_DATABASE_URL);
  connection.searchParams.set('options', `-csearch_path=${schema},public`);
  process.env.DATABASE_URL = connection.toString();
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.NODE_ENV = 'test'; process.env.APP_URL = base.origin;
  process.env.CORS_ORIGIN = base.origin; process.env.LOG_LEVEL = 'erro';
  process.env.PRIVACY_CONTROLLER_NAME = 'Empresa fictícia de homologação';
  process.env.PRIVACY_CONTACT_EMAIL = 'privacidade@example.test';
  db = require('../src/config/database');
  await require('../src/database/migrate').aplicarMigracoes(db);
  const empresaA = (await db.query("INSERT INTO empresas(nome) VALUES('Empresa A de teste') RETURNING id")).rows[0].id;
  const empresaB = (await db.query("INSERT INTO empresas(nome) VALUES('Empresa B de teste') RETURNING id")).rows[0].id;
  const senha = await bcrypt.hash('SenhaTeste123', 4);
  const usuarios = {};
  for (const [nome, perfil, empresa] of [['tecnico-a','TECNICO',empresaA],['outro-tecnico','TECNICO',empresaA],['gestor-a','GESTOR',empresaA],['gestor-limitado','GESTOR',empresaA],['gestor-b','GESTOR',empresaB],['desativar','TECNICO',empresaA]]) {
    usuarios[nome] = (await db.query('INSERT INTO usuarios(nome,email,senha_hash,perfil,empresa_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [nome, `${nome}@example.test`, senha, perfil, empresa])).rows[0].id;
  }
  await db.query("INSERT INTO usuario_permissoes(usuario_id,permissao,permitido) VALUES($1,'CLIENTES_GERENCIAR',FALSE)",[usuarios['gestor-limitado']]);
  await db.query("INSERT INTO usuario_permissoes(usuario_id,permissao,permitido) VALUES($1,'ATENDIMENTO_RESPONDER',FALSE)",[usuarios['gestor-limitado']]);
  const cliente = (await db.query("INSERT INTO clientes(nome,empresa_id) VALUES('Cliente sintético', $1) RETURNING id",[empresaA])).rows[0].id;
  for(const [telefone,contato,expirada] of [['5500000000001','Maria WhatsApp',false],['5500000000002','João WhatsApp',true],['5500000000003','Pedro WhatsApp',false]]){
    const conversa=(await db.query(`INSERT INTO whatsapp_conversas(empresa_id,telefone,nome_contato,fila_status,bot_ativo,bot_etapa,triagem,janela_atendimento_ate,ultima_mensagem,ultima_mensagem_em)
      VALUES($1,$2,$3,'ESPERA',FALSE,'AGUARDANDO_ATENDENTE',$4::jsonb,NOW()+($5::int*INTERVAL '1 hour'),'Pedido sintético',NOW()) RETURNING id`,[empresaA,telefone,contato,JSON.stringify({servico:'LIMPEZA',nome:contato,localidade:'Natal, Tirol',descricao:'Limpeza de dois aparelhos sintéticos'}),expirada?-1:23])).rows[0].id;
    await db.query("INSERT INTO whatsapp_mensagens(conversa_id,direcao,tipo,conteudo,status) VALUES($1,'ENTRADA','text','Pedido sintético','recebida')",[conversa]);
  }
  const protocolo = '00000000-0000-4000-8000-000000000001';
  await db.query("INSERT INTO privacidade_solicitacoes(id,empresa_id,solicitante_id,tipo,descricao,status) VALUES($1,$2,$3,'ACESSO','Pedido de acesso com histórico paginado','EM_ANALISE')",[protocolo,empresaA,usuarios['tecnico-a']]);
  for(let i=1;i<=55;i++) await db.query("INSERT INTO privacidade_historico(solicitacao_id,usuario_id,status,resposta) VALUES($1,$2,'EM_ANALISE',$3)",[protocolo,usuarios['gestor-a'],`Andamento de teste ${i}`]);
  await db.query("INSERT INTO privacidade_solicitacoes(id,empresa_id,solicitante_id,cliente_id,tipo,descricao) VALUES($1,$2,$3,$4,'ACESSO','Pedido restrito de cliente sintético')",['00000000-0000-4000-8000-000000000002',empresaA,usuarios['gestor-a'],cliente]);
  const express = require('express'), app = express();
  const mobileDir = path.resolve(__dirname,'..','web','e2e-mobile-dist');
  if(fs.existsSync(mobileDir))app.use('/homologacao-mobile',express.static(mobileDir));
  app.use(require('../src/app')());
  server = app.listen(Number(base.port), '127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  console.log('Homologação pronta: fixtures sintéticas e schema isolado, sem workers.');
}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{encerrar().then(()=>process.exit(0)).catch(()=>process.exit(1));});
main().catch(async error=>{console.error('Falha no servidor de testes:',error.code || error.message);await encerrar().catch(()=>{});process.exit(1);});
