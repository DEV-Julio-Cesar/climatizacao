const db = require('../config/database');
const DocumentoService = require('./DocumentoService');
const logger = require('../config/logger');

let executando = false;
async function processar() {
  if (executando) return;
  executando = true;
  let tarefa;
  try {
    const resultado = await db.query(`UPDATE fila_documentos SET bloqueado_ate=NOW()+INTERVAL '10 minutes',tentativas=tentativas+1
      WHERE os_id=(SELECT os_id FROM fila_documentos WHERE concluido_em IS NULL AND executar_em<=NOW()
        AND (bloqueado_ate IS NULL OR bloqueado_ate<NOW()) ORDER BY executar_em LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *`);
    tarefa = resultado.rows[0];
    if (!tarefa) return;
    await DocumentoService.gerarDocumento(tarefa.os_id, { empresa_id: tarefa.empresa_id });
    await db.query('UPDATE fila_documentos SET concluido_em=NOW(),bloqueado_ate=NULL,ultimo_erro=NULL WHERE os_id=$1 AND tentativas=$2', [tarefa.os_id, tarefa.tentativas]);
  } catch (error) {
    logger.erro('documento.worker', { os_id: tarefa?.os_id, erro_mensagem: error.message });
    if (tarefa) await db.query("UPDATE fila_documentos SET bloqueado_ate=NULL,ultimo_erro=$2,executar_em=NOW()+($3::int*INTERVAL '1 second') WHERE os_id=$1 AND tentativas=$4", [tarefa.os_id, String(error.message).slice(0, 500), Math.min(3600, 30 * 2 ** Math.min(tarefa.tentativas, 7)), tarefa.tentativas]).catch(erro => logger.erro('documento.retry', { erro_mensagem: erro.message }));
  } finally { executando = false; }
}

function iniciar() {
  const timer = setInterval(processar, 5000);
  timer.unref();
  void processar();
  return () => clearInterval(timer);
}
module.exports = { processar, iniciar };
