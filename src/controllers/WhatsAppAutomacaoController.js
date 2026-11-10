const { z } = require('zod');
const db = require('../config/database');
const Bot = require('../services/WhatsAppBotService');
const Automacao = require('../services/WhatsAppAutomacaoService');
const logger = require('../config/logger');
const configSchema = z.object({ ativo:z.boolean(),nome_atendimento:z.string().trim().min(2).max(150),boas_vindas:z.string().trim().min(5).max(700),horario_informativo:z.string().trim().max(300),encaminhamento:z.string().trim().min(5).max(500) }).strict();
const dadosSchema = z.object({servico:z.enum(Object.keys(Bot.SERVICOS)).optional(),nome:z.string().max(80).optional(),localidade:z.string().max(150).optional(),descricao:z.string().max(1000).optional()}).strict();
const simularSchema = z.object({ texto:z.string().trim().min(1).max(4096),config:configSchema,
  estado:z.object({etapa:z.enum(['INICIO','AGUARDANDO_SERVICO','AGUARDANDO_NOME','AGUARDANDO_LOCALIDADE','AGUARDANDO_DESCRICAO','AGUARDANDO_ATENDENTE']).default('INICIO'),dados:dadosSchema.default({}),tentativas:z.number().int().min(0).max(2).default(0)}).strict() }).strict();
class WhatsAppAutomacaoController {
  async configuracao(req,res){try{return res.json(await Automacao.configuracao(req.usuarioLogado.empresa_id));}catch(error){logger.erro('whatsapp.configurar',{erro_codigo:error.code||'CONFIG_ERROR'});return res.status(500).json({erro:'Não foi possível carregar a configuração.'});}}
  async salvar(req,res){
    const entrada=configSchema.safeParse(req.body);if(!entrada.success)return res.status(400).json({erro:'Revise os textos e limites da configuração.'});
    const c=entrada.data,empresa=req.usuarioLogado.empresa_id;
    try{
      await db.transaction(async client=>{
        await client.query(`INSERT INTO whatsapp_automacao(empresa_id,ativo,nome_atendimento,boas_vindas,horario_informativo,encaminhamento)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(empresa_id) DO UPDATE SET ativo=EXCLUDED.ativo,nome_atendimento=EXCLUDED.nome_atendimento,boas_vindas=EXCLUDED.boas_vindas,horario_informativo=EXCLUDED.horario_informativo,encaminhamento=EXCLUDED.encaminhamento,updated_at=NOW()`,[empresa,c.ativo,c.nome_atendimento,c.boas_vindas,c.horario_informativo,c.encaminhamento]);
        if(!c.ativo)await client.query("UPDATE whatsapp_conversas SET bot_ativo=FALSE,fila_status='ESPERA',bot_versao=bot_versao+1,updated_at=NOW() WHERE empresa_id=$1 AND fila_status='AUTOMACAO' AND encerrado_em IS NULL",[empresa]);
      });return res.json(c);
    }catch(error){logger.erro('whatsapp.configurar',{erro_codigo:error.code||'CONFIG_ERROR'});return res.status(500).json({erro:'Não foi possível salvar a configuração.'});}
  }
  simular(req,res){
    const entrada=simularSchema.safeParse(req.body);if(!entrada.success)return res.status(400).json({erro:'Dados da simulação inválidos.'});
    const {texto,config,estado}=entrada.data;
    return res.json(Bot.decidir(estado.etapa,texto,null,{config,dados:estado.dados,tentativas:estado.tentativas,tipo:'text'}));
  }
}
module.exports=new WhatsAppAutomacaoController();
