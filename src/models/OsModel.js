const db = require('../config/database');

class OsModel {
  
  // Criar uma nova Ordem de Serviço
  async criar(dadosOs) {
    const query = `
      INSERT INTO ordens_servico 
      (empresa_id, cliente_id, aparelho_id, tecnico_id, tipo_servico, descricao_problema)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, status, created_at;
    `;
    const valores = [
      dadosOs.empresa_id,
      dadosOs.cliente_id,
      dadosOs.aparelho_id,
      dadosOs.tecnico_id,
      dadosOs.tipo_servico,
      dadosOs.descricao_problema
    ];

    const resultado = await db.query(query, valores);
    return resultado.rows[0];
  }

  // Busca segura garantindo o Multi-Tenant (NUNCA busca O.S. de outra empresa)
  async buscarPorId(os_id, empresa_id) {
    const query = `
      SELECT * FROM ordens_servico 
      WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL;
    `;
    const resultado = await db.query(query, [os_id, empresa_id]);
    return resultado.rows[0]; // Retorna a O.S. se for da mesma empresa, senão undefined
  }

  // Função dedicada para gravar o histórico de alterações (Princípio Não-Destrutivo)
  async registrarHistorico(os_id, status_anterior, status_novo, usuario_id) {
    const query = `
      INSERT INTO os_historico 
      (os_id, status_anterior, status_novo, modificado_por)
      VALUES ($1, $2, $3, $4);
    `;
    await db.query(query, [os_id, status_anterior, status_novo, usuario_id]);
  }

  // Busca todos os dados formatados para gerar o PDF — faz JOIN com clientes e empresas
  async buscarDadosCompletosParaPdf(os_id) {
    const query = `
      SELECT
        os.id,
        os.tipo_servico,
        os.descricao_problema,
        os.valor_total,
        os.finalizado_em,
        cli.nome        AS cliente_nome,
        cli.telefone    AS telefone_whatsapp,
        cli.endereco    AS cliente_endereco,
        emp.nome        AS empresa_nome
      FROM ordens_servico os
      INNER JOIN clientes      cli ON cli.id = os.cliente_id
      INNER JOIN empresas      emp ON emp.id = os.empresa_id
      WHERE os.id = $1;
    `;
    const resultado = await db.query(query, [os_id]);
    return resultado.rows[0];
  }


// Retorna a agenda do dia para o técnico logado
  async listarAgendaDoTecnico(tecnico_id, empresa_id) {
    const query = `
      SELECT 
        os.id, 
        os.tipo_servico, 
        os.status, 
        os.agendado_para,
        c.nome AS cliente_nome, 
        c.endereco_completo, 
        c.coordenadas_gps
      FROM ordens_servico os
      JOIN clientes c ON os.cliente_id = c.id
      WHERE os.tecnico_id = $1 
        AND os.empresa_id = $2 
        AND os.status IN ('ABERTA', 'EM_ANDAMENTO')
        AND os.deleted_at IS NULL
      ORDER BY os.agendado_para ASC;
    `;
    
    const resultado = await db.query(query, [tecnico_id, empresa_id]);
    return resultado.rows;
  }
}
module.exports = new OsModel();