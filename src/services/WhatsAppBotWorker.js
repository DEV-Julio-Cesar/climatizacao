const db = require('../config/database');
const Contas = require('./WhatsAppContaService');
const logger = require('../config/logger');
let executando = false;
async function processar(executor = db, contas = Contas) {
  if (executando) return; executando = true;
  try {
    await executor.transaction(async client => {
      const tarefa = (await client.query(`SELECT q.*,c.telefone,c.atendente_id,c.encerrado_em,c.bot_versao,c.janela_atendimento_ate,c.fila_status
        FROM whatsapp_respostas_bot q JOIN whatsapp_conversas c ON c.id=q.conversa_id AND c.empresa_id=q.empresa_id
        WHERE q.concluido_em IS NULL AND q.cancelado_em IS NULL AND q.executar_em<=NOW()
        AND NOT EXISTS(SELECT 1 FROM whatsapp_respostas_bot anterior WHERE anterior.conversa_id=q.conversa_id AND anterior.id<q.id AND anterior.concluido_em IS NULL AND anterior.cancelado_em IS NULL)
        ORDER BY q.id LIMIT 1 FOR UPDATE OF q,c SKIP LOCKED`)).rows[0];
      if (!tarefa) return;
      if (tarefa.atendente_id || tarefa.encerrado_em || tarefa.fila_status==='ATENDENDO' || tarefa.bot_versao!==tarefa.versao || !tarefa.janela_atendimento_ate || new Date(tarefa.janela_atendimento_ate)<=new Date()) {
        await client.query("UPDATE whatsapp_respostas_bot SET cancelado_em=NOW(),ultimo_erro='CONTEXTO_ALTERADO' WHERE id=$1",[tarefa.id]);return;
      }
      await client.query('SAVEPOINT envio_bot');
      try {
        const canal=await contas.paraEmpresa(tarefa.empresa_id), retorno=await canal.enviarMensagem(tarefa.telefone,tarefa.texto);
        const whatsappId=retorno?.messages?.[0]?.id;
        if(!whatsappId)throw Object.assign(new Error('Envio sem confirmação.'),{code:'SEM_CONFIRMACAO'});
        await client.query("INSERT INTO whatsapp_mensagens(conversa_id,whatsapp_id,direcao,tipo,conteudo,status) VALUES($1,$2,'SAIDA','text',$3,'enviada') ON CONFLICT(whatsapp_id) DO NOTHING",[tarefa.conversa_id,whatsappId,tarefa.texto]);
        await client.query('UPDATE whatsapp_conversas SET ultima_mensagem=$1,ultima_mensagem_em=NOW(),updated_at=NOW() WHERE id=$2 AND empresa_id=$3',[tarefa.texto,tarefa.conversa_id,tarefa.empresa_id]);
        await client.query('UPDATE whatsapp_respostas_bot SET concluido_em=NOW(),tentativas=tentativas+1,ultimo_erro=NULL WHERE id=$1',[tarefa.id]);
      } catch(error) {
        await client.query('ROLLBACK TO SAVEPOINT envio_bot');
        // Não repetir automaticamente um envio ambíguo: a Meta pode ter aceitado.
        // Encaminhar à pessoa evita uma sequência de perguntas duplicadas.
        await client.query("UPDATE whatsapp_respostas_bot SET cancelado_em=NOW(),tentativas=tentativas+1,ultimo_erro='ENVIO_NAO_CONFIRMADO' WHERE id=$1",[tarefa.id]);
        await client.query("UPDATE whatsapp_conversas SET fila_status='ESPERA',bot_ativo=FALSE,bot_versao=bot_versao+1,updated_at=NOW() WHERE id=$1 AND empresa_id=$2",[tarefa.conversa_id,tarefa.empresa_id]);
        logger.aviso('whatsapp.bot.envio_nao_confirmado',{conversa_id:tarefa.conversa_id,empresa_id:tarefa.empresa_id});
      }
    });
  } catch(error) { logger.erro('whatsapp.bot.worker',{erro_codigo:error.code || 'WORKER_ERROR'}); }
  finally { executando=false; }
}
function iniciar(){const timer=setInterval(()=>void processar(),2000);timer.unref();return()=>clearInterval(timer);}
module.exports={processar,iniciar};
