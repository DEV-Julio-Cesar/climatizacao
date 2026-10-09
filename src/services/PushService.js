const db = require('../config/database');

class PushService {
  async enviar(usuarioId, titulo, mensagem, dados = {}) {
    try {
      if (!process.env.DATABASE_URL) return;
      const tokens = await db.query('SELECT token FROM dispositivos_push WHERE usuario_id=$1 AND ativo=TRUE', [usuarioId]);
      if (!tokens.rows.length) return;
      const notificacoes = tokens.rows.map(({ token }) => ({ to:token, sound:'default', title:titulo, body:mensagem, data:dados, priority:'high' }));
      const response = await fetch('https://exp.host/--/api/v2/push/send', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify(notificacoes) });
      if (!response.ok) throw new Error(`Expo Push respondeu ${response.status}`);
    } catch (error) { console.error('Falha ao enviar push:', error.message); }
  }
}
module.exports = new PushService();
