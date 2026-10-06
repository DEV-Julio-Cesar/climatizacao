require('dotenv').config();
const db = require('../config/database');

async function executar() {
  await db.transaction(async (client) => {
    const empresas = await client.query('SELECT id FROM empresas');
    for (const { id: empresaId } of empresas.rows) {
      const servico = await client.query(
        `UPDATE catalogo_servicos SET nome=$1, descricao=$2
         WHERE empresa_id=$3 AND nome LIKE 'Higieniza%'
         RETURNING id, nome`,
        ['Higienizacao completa Split', 'Limpeza completa de filtros, evaporadora, condensadora e dreno', empresaId]
      );
      await client.query(
        `UPDATE produtos SET nome=$1, categoria=$2
         WHERE empresa_id=$3 AND sku='CAP-35UF'`,
        ['Capacitor 35 uF', 'Eletrica', empresaId]
      );
      if (servico.rows[0]) {
        await client.query(
          `UPDATE os_itens SET descricao=$1
           WHERE tipo='SERVICO' AND referencia_id=$2`,
          [servico.rows[0].nome, servico.rows[0].id]
        );
      }
    }
  });
  console.log('Catalogo inicial revisado com sucesso.');
  await db.pool.end();
}

executar().catch(async (error) => {
  console.error('Falha ao revisar catalogo:', error.message);
  await db.pool.end();
  process.exit(1);
});
