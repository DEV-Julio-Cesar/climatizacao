const db = require('../config/database');
const logger = require('../config/logger');
let executando = false;
async function processar() {
  if (executando) return;
  executando = true;
  try {
    await db.transaction(async client => {
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(782105) AS adquirido');
      if (!lock.rows[0]?.adquirido) return;
      await client.query(`INSERT INTO notificacoes(empresa_id,usuario_id,tipo,titulo,mensagem,referencia_tipo,referencia_id,chave_alerta)
        SELECT p.empresa_id,u.id,'ESTOQUE','Estoque mínimo',LEFT(p.nome||': saldo '||p.estoque||', mínimo '||p.estoque_minimo,500),'PRODUTO',p.id,'estoque:'||p.id||':'||CURRENT_DATE
        FROM produtos p JOIN usuarios u ON u.empresa_id=p.empresa_id JOIN empresas e ON e.id=p.empresa_id
        WHERE p.ativo=TRUE AND p.estoque<=p.estoque_minimo AND u.ativo=TRUE AND u.deleted_at IS NULL
          AND u.perfil IN('GESTOR','ADMIN') AND e.ativo=TRUE AND e.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM usuario_permissoes up WHERE up.usuario_id=u.id AND up.permissao='ESTOQUE_VISUALIZAR' AND up.permitido=FALSE)
        ON CONFLICT DO NOTHING`);
      await client.query(`INSERT INTO notificacoes(empresa_id,usuario_id,tipo,titulo,mensagem,referencia_tipo,referencia_id,chave_alerta)
        SELECT c.empresa_id,u.id,'MANUTENCAO',CASE WHEN c.proxima_visita<CURRENT_DATE THEN 'Visita preventiva atrasada' ELSE 'Visita preventiva programada' END,
          LEFT(c.nome||' - '||cli.nome||': '||to_char(c.proxima_visita,'DD/MM/YYYY'),500),'CONTRATO',c.id,'contrato:'||c.id||':'||c.proxima_visita||':'||CURRENT_DATE
        FROM contratos c JOIN clientes cli ON cli.id=c.cliente_id AND cli.empresa_id=c.empresa_id
          JOIN usuarios u ON u.empresa_id=c.empresa_id JOIN empresas e ON e.id=c.empresa_id
        WHERE c.status='ATIVO' AND c.proxima_visita<=CURRENT_DATE+15 AND cli.deleted_at IS NULL
          AND u.ativo=TRUE AND u.deleted_at IS NULL AND u.perfil IN('GESTOR','ADMIN') AND e.ativo=TRUE AND e.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM usuario_permissoes up WHERE up.usuario_id=u.id AND up.permissao='GESTAO_VISUALIZAR' AND up.permitido=FALSE)
        ON CONFLICT DO NOTHING`);
    });
  } catch (error) { logger.erro('alerta.worker', { erro_mensagem: error.message }); }
  finally { executando = false; }
}
function iniciar() {
  const timer = setInterval(processar, 60 * 60 * 1000);
  timer.unref(); void processar();
  return () => clearInterval(timer);
}
module.exports = { processar, iniciar };
