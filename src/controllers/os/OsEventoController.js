const db = require('../../config/database');
const OsModel = require('../../models/OsModel');
const PushService = require('../../services/PushService');
const validarConflito = require('./validarConflito');

const gestor = (perfil) => ['GESTOR', 'ADMIN'].includes(perfil);

/**
 * Eventos de campo: check-in, check-out, pausa, retomada, a-caminho.
 * POST /os/:id/eventos  · POST /os/:id/retorno  · PATCH /os/:id/agendar
 */
class OsEventoController {
  async registrarEvento(req, res) {
    const id = Number(req.params.id);
    const usuario = req.usuarioLogado;
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ erro: 'ID inválido.' });

    try {
      const atualizada = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os)
          throw Object.assign(new Error('O.S. não encontrada.'), { status: 404 });
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id)
          throw Object.assign(new Error('Acesso negado.'), { status: 403 });

        const { evento, latitude, longitude, motivo } = req.body;

        if (evento === 'A_CAMINHO' && os.status !== 'ABERTA')
          throw Object.assign(new Error('A O.S. precisa estar aberta.'), { status: 409 });
        if (evento === 'CHECKIN' && os.status !== 'ABERTA')
          throw Object.assign(
            new Error('Check-in permitido apenas em O.S. aberta.'),
            { status: 409 },
          );
        if (evento === 'CHECKOUT' && os.status !== 'EM_ANDAMENTO')
          throw Object.assign(
            new Error('Check-out permitido apenas em atendimento.'),
            { status: 409 },
          );
        if (evento === 'PAUSAR' && (os.status !== 'EM_ANDAMENTO' || os.pausado_em))
          throw Object.assign(new Error('A O.S. não pode ser pausada agora.'), {
            status: 409,
          });
        if (evento === 'RETOMAR' && (os.status !== 'EM_ANDAMENTO' || !os.pausado_em))
          throw Object.assign(new Error('A O.S. não está pausada.'), { status: 409 });

        if (evento === 'PAUSAR')
          await client.query(
            'INSERT INTO os_pausas(os_id,usuario_id,motivo) VALUES($1,$2,$3)',
            [id, usuario.usuario_id, motivo || null],
          );
        if (evento === 'RETOMAR')
          await client.query(
            `UPDATE os_pausas SET retomado_em=NOW()
              WHERE id=(SELECT id FROM os_pausas WHERE os_id=$1 AND retomado_em IS NULL
                        ORDER BY iniciado_em DESC LIMIT 1)`,
            [id],
          );

        const atualizacoes = {
          A_CAMINHO: ['a_caminho_em=COALESCE(a_caminho_em,NOW())', []],
          CHECKIN: [
            "checkin_em=COALESCE(checkin_em,NOW()),checkin_latitude=$1,checkin_longitude=$2,status='EM_ANDAMENTO',iniciado_em=COALESCE(iniciado_em,NOW())",
            [latitude, longitude],
          ],
          CHECKOUT: [
            'checkout_em=COALESCE(checkout_em,NOW()),checkout_latitude=$1,checkout_longitude=$2',
            [latitude, longitude],
          ],
          PAUSAR: ['pausado_em=NOW()', []],
          RETOMAR: [
            'total_pausa_segundos=total_pausa_segundos+GREATEST(EXTRACT(EPOCH FROM(NOW()-pausado_em))::int,0),pausado_em=NULL',
            [],
          ],
        };

        const [sql, valores] = atualizacoes[evento];
        valores.push(id, usuario.empresa_id);
        const result = await client.query(
          `UPDATE ordens_servico SET ${sql},updated_at=NOW()
            WHERE id=$${valores.length - 1} AND empresa_id=$${valores.length} RETURNING *`,
          valores,
        );

        await OsModel.registrarHistorico(
          {
            osId: id,
            statusAnterior: os.status,
            statusNovo: evento === 'CHECKIN' ? 'EM_ANDAMENTO' : os.status,
            usuarioId: usuario.usuario_id,
            observacao:
              evento === 'A_CAMINHO'
                ? 'Técnico a caminho'
                : evento === 'CHECKIN'
                  ? 'Check-in realizado com GPS'
                  : 'Check-out realizado com GPS',
          },
          client,
        );

        return result.rows[0];
      });

      return res.json({ mensagem: 'Evento registrado.', os: atualizada });
    } catch (error) {
      return res
        .status(error.status || 500)
        .json({ erro: error.status ? error.message : 'Falha ao registrar evento.' });
    }
  }

  async criarRetorno(req, res) {
    // Bug 4 — validar ID antes de qualquer outra coisa
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ erro: 'ID inválido.' });

    const usuario = req.usuarioLogado;

    if (!req.body.agendado_para || Number.isNaN(Date.parse(req.body.agendado_para)))
      return res.status(400).json({ erro: 'Data do retorno inválida.' });

    try {
      const nova = await db.transaction(async (client) => {
        const origem = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!origem)
          throw Object.assign(new Error('O.S. não encontrada.'), { status: 404 });
        if (!gestor(usuario.perfil) && origem.tecnico_id !== usuario.usuario_id)
          throw Object.assign(new Error('Acesso negado.'), { status: 403 });

        // Bug 3 — verificar conflito de agenda antes de criar o retorno
        await validarConflito(
          client,
          usuario.empresa_id,
          origem.tecnico_id,
          req.body.agendado_para,
          req.body.duracao_prevista_minutos,
        );

        const motivo = String(req.body.motivo || `Retorno da O.S. #${id}`)
          .trim()
          .slice(0, 1000);

        const r = await client.query(
          `INSERT INTO ordens_servico
             (empresa_id,cliente_id,aparelho_id,tecnico_id,tipo_servico,descricao_problema,agendado_para,retorno_de_os_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            usuario.empresa_id,
            origem.cliente_id,
            origem.aparelho_id,
            origem.tecnico_id,
            origem.tipo_servico,
            motivo,
            req.body.agendado_para,
            id,
          ],
        );

        // Bug 5 — filtrar por empresa_id para garantir isolamento multi-tenant
        await client.query(
          `UPDATE ordens_servico
              SET retorno_necessario=TRUE,
                  situacao_pendencia='RETORNO_AGENDADO',
                  motivo_pendencia=$1,
                  updated_at=NOW()
            WHERE id=$2 AND empresa_id=$3`,
          [motivo, id, usuario.empresa_id],
        );

        await OsModel.registrarHistorico(
          {
            osId: id,
            statusAnterior: origem.status,
            statusNovo: origem.status,
            usuarioId: usuario.usuario_id,
            observacao: `Retorno agendado na O.S. #${r.rows[0].id}`,
          },
          client,
        );

        return r.rows[0];
      });

      void PushService.enviar(
        nova.tecnico_id,
        'Visita de retorno',
        `Retorno #${nova.id} agendado.`,
        { os_id: nova.id },
      );

      return res.status(201).json(nova);
    } catch (e) {
      return res
        .status(e.status || 500)
        .json({ erro: e.status ? e.message : 'Falha ao criar retorno.' });
    }
  }

  async agendarVisita(req, res) {
    const id = Number(req.params.id);
    const usuario = req.usuarioLogado;
    const quando = req.body.agendado_para;

    if (!Number.isInteger(id) || !quando || Number.isNaN(Date.parse(quando)))
      return res.status(400).json({ erro: 'Data e horário inválidos.' });

    try {
      const atualizada = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os)
          throw Object.assign(new Error('O.S. não encontrada.'), { status: 404 });
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id)
          throw Object.assign(new Error('Acesso negado.'), { status: 403 });
        if (['FINALIZADA', 'CANCELADA'].includes(os.status))
          throw Object.assign(
            new Error('Não é possível agendar uma O.S. encerrada.'),
            { status: 409 },
          );

        const r = await client.query(
          'UPDATE ordens_servico SET agendado_para=$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3 RETURNING *',
          [quando, id, usuario.empresa_id],
        );

        await OsModel.registrarHistorico(
          {
            osId: id,
            statusAnterior: os.status,
            statusNovo: os.status,
            usuarioId: usuario.usuario_id,
            observacao: `Visita agendada para ${quando}`,
          },
          client,
        );

        return r.rows[0];
      });

      void PushService.enviar(
        atualizada.tecnico_id,
        'Visita agendada',
        `A O.S. #${id} foi agendada.`,
        { os_id: id },
      );

      return res.json({ mensagem: 'Visita agendada.', os: atualizada });
    } catch (e) {
      return res
        .status(e.status || 500)
        .json({ erro: e.status ? e.message : 'Falha ao agendar visita.' });
    }
  }
}

module.exports = new OsEventoController();
