/**
 * Verifica se um técnico já possui outra O.S. agendada que se sobreponha ao
 * intervalo [inicio, inicio + duracao). Lança erro 409 se houver conflito.
 *
 * @param {import('pg').PoolClient} client  - Conexão dentro de uma transaction
 * @param {number}  empresaId
 * @param {number}  tecnicoId
 * @param {string}  inicio               - ISO 8601 timestamp
 * @param {number}  [duracao=120]        - Duração prevista em minutos
 * @param {number|null} [ignorarId=null] - ID da própria O.S. (ao reagendar)
 */
async function validarConflito(
  client,
  empresaId,
  tecnicoId,
  inicio,
  duracao = 120,
  ignorarId = null,
) {
  if (!inicio) return;

  const resultado = await client.query(
    `SELECT id
       FROM ordens_servico
      WHERE empresa_id = $1
        AND tecnico_id = $2
        AND status IN ('ABERTA', 'EM_ANDAMENTO')
        AND deleted_at IS NULL
        AND ($5::int IS NULL OR id <> $5)
        AND agendado_para IS NOT NULL
        AND tstzrange(
              agendado_para,
              agendado_para + (duracao_prevista_minutos || ' minutes')::interval,
              '[)'
            ) && tstzrange(
              $3::timestamptz,
              $3::timestamptz + ($4 || ' minutes')::interval,
              '[)'
            )
      LIMIT 1`,
    [empresaId, tecnicoId, inicio, duracao, ignorarId],
  );

  if (resultado.rows[0]) {
    throw Object.assign(
      new Error(
        `Conflito de agenda com a O.S. #${resultado.rows[0].id}. Escolha outro horário ou técnico.`,
      ),
      { status: 409 },
    );
  }
}

module.exports = validarConflito;
