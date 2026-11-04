const db=require('../config/database');
const Email=require('./EmailService');
const Recuperacao=require('./RecuperacaoSenhaService');
const logger=require('../config/logger');
let executando=false;
let ultimaLimpeza=0;
async function processar(){
  if(executando||!Email.configurado())return;executando=true;let tarefa;
  try{
    if(Date.now()-ultimaLimpeza>60000){
      await db.query("UPDATE emails_recuperacao q SET conteudo_cifrado='',concluido_em=NOW(),bloqueado_ate=NULL FROM recuperacoes_senha r WHERE r.id=q.id AND q.concluido_em IS NULL AND (r.usado_em IS NOT NULL OR r.expira_em<=NOW())");
      ultimaLimpeza=Date.now();
    }
    const consulta=await db.query(`UPDATE emails_recuperacao SET bloqueado_ate=NOW()+INTERVAL '1 minute',tentativas=tentativas+1 WHERE id=(
      SELECT q.id FROM emails_recuperacao q JOIN recuperacoes_senha r ON r.id=q.id JOIN usuarios u ON u.id=r.usuario_id JOIN empresas e ON e.id=r.empresa_id
      WHERE q.concluido_em IS NULL AND q.executar_em<=NOW() AND q.tentativas<5 AND (q.bloqueado_ate IS NULL OR q.bloqueado_ate<NOW())
        AND r.usado_em IS NULL AND r.expira_em>NOW() AND u.ativo=TRUE AND u.deleted_at IS NULL AND e.ativo=TRUE AND e.deleted_at IS NULL
      ORDER BY q.executar_em LIMIT 1 FOR UPDATE OF q SKIP LOCKED) RETURNING *`);
    tarefa=consulta.rows[0];if(!tarefa)return;
    await Email.enviar(Recuperacao.decifrar(tarefa.conteudo_cifrado));
    await db.query("UPDATE emails_recuperacao SET concluido_em=NOW(),bloqueado_ate=NULL,conteudo_cifrado='',ultimo_erro=NULL WHERE id=$1 AND tentativas=$2",[tarefa.id,tarefa.tentativas]);
  }catch(error){
    const codigo=String(error.code||'EMAIL_ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,80);
    logger.erro('email.worker',{erro_codigo:codigo});
    if(tarefa)await db.query("UPDATE emails_recuperacao SET bloqueado_ate=NULL,ultimo_erro=$2,executar_em=NOW()+($3::int*INTERVAL '1 second') WHERE id=$1 AND tentativas=$4",[tarefa.id,codigo,Math.min(120,15*2**tarefa.tentativas),tarefa.tentativas]).catch(()=>{});
  }finally{executando=false;}
}
function iniciar(){const timer=setInterval(processar,2000);timer.unref();void processar();return()=>clearInterval(timer);}
module.exports={processar,iniciar};
