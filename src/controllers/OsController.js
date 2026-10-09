const db = require('../config/database');
const OsModel = require('../models/OsModel');
const PdfService = require('../services/PdfService');
const WhatsAppService = require('../services/WhatsAppService');
const PushService = require('../services/PushService');

const transicoes = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['FINALIZADA', 'CANCELADA'],
  FINALIZADA: [],
  CANCELADA: [],
};

const gestor = (perfil) => ['GESTOR', 'ADMIN'].includes(perfil);

class OsController {
  async criar(req, res) {
    const usuario = req.usuarioLogado;
    const tecnicoId = gestor(usuario.perfil) && req.body.tecnico_id
      ? req.body.tecnico_id
      : usuario.usuario_id;

    try {
      const novaOs = await db.transaction(async (client) => {
        const relacionamento = await OsModel.validarRelacionamentos({
          empresaId: usuario.empresa_id,
          clienteId: req.body.cliente_id,
          aparelhoId: req.body.aparelho_id,
          tecnicoId,
        }, client);
        if (!relacionamento.valido) {
          const error = new Error(`Relacionamento inválido: ${relacionamento.campo}`);
          error.status = 400;
          throw error;
        }

        const os = await OsModel.criar({
          empresaId: usuario.empresa_id,
          clienteId: req.body.cliente_id,
          aparelhoId: req.body.aparelho_id,
          tecnicoId,
          tipoServico: req.body.tipo_servico,
          descricaoProblema: req.body.descricao_problema,
          valorTotal: req.body.valor_total,
          agendadoPara: req.body.agendado_para,
        }, client);
        await OsModel.registrarHistorico({
          osId: os.id,
          statusAnterior: null,
          statusNovo: os.status,
          usuarioId: usuario.usuario_id,
          observacao: 'Ordem de serviço criada',
        }, client);
        return os;
      });
      void PushService.enviar(novaOs.tecnico_id, 'Nova ordem de serviço', `A O.S. #${novaOs.id} foi atribuída a você.`, { os_id:novaOs.id });
      return res.status(201).json({ mensagem: 'Ordem de serviço criada.', os: novaOs });
    } catch (error) {
      console.error('Erro ao criar O.S.:', error.message);
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao criar a O.S.' });
    }
  }

  async atualizarStatus(req, res) {
    const id = Number(req.params.id);
    const { novo_status: novoStatus } = req.body;
    const usuario = req.usuarioLogado;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });

    try {
      const atualizada = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os) {
          const error = new Error('O.S. não encontrada ou acesso negado.');
          error.status = 404;
          throw error;
        }
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id) {
          const error = new Error('Acesso negado a esta O.S.');
          error.status = 403;
          throw error;
        }
        if (!transicoes[os.status]?.includes(novoStatus)) {
          const error = new Error(`Transição de ${os.status} para ${novoStatus} não permitida.`);
          error.status = 409;
          throw error;
        }
        if (novoStatus === 'FINALIZADA') {
          if (!os.diagnostico || !os.solucao_aplicada) {
            const error = new Error('Preencha o relatório técnico antes de finalizar.');
            error.status = 422; throw error;
          }
          const assinatura = await client.query("SELECT id FROM os_fotos WHERE os_id=$1 AND tipo='ASSINATURA' LIMIT 1", [id]);
          if (!assinatura.rows[0]) {
            const error = new Error('Colete a assinatura do cliente antes de finalizar.');
            error.status = 422; throw error;
          }
          const evidencias = await client.query("SELECT COUNT(*)::int total FROM os_fotos WHERE os_id=$1 AND tipo IN ('ANTES','DEPOIS','EVIDENCIA')", [id]);
          if (evidencias.rows[0].total < 2) { const error = new Error('Registre pelo menos duas fotos do atendimento antes de finalizar.'); error.status = 422; throw error; }
          const checklist = await client.query('SELECT id FROM os_checklist_respostas WHERE os_id=$1 LIMIT 1', [id]);
          if (!checklist.rows[0]) { const error = new Error('Preencha o checklist antes de finalizar.'); error.status = 422; throw error; }
          if (!os.checkout_em) { const error = new Error('Realize o check-out com GPS antes de finalizar.'); error.status = 422; throw error; }
          const itensEstoque = await client.query(
            `SELECT oi.id,oi.referencia_id,oi.quantidade,p.nome,p.estoque,et.quantidade estoque_tecnico,et.tecnico_id
             FROM os_itens oi
             JOIN produtos p ON p.id=oi.referencia_id AND p.empresa_id=$2
             LEFT JOIN estoque_tecnico et ON et.produto_id=p.id AND et.tecnico_id=$3
             WHERE oi.os_id=$1 AND oi.tipo='PECA' AND oi.estoque_baixado=FALSE
             FOR UPDATE OF p`, [id, usuario.empresa_id,os.tecnico_id]);
          for (const item of itensEstoque.rows) {
            const quantidade = Number(item.quantidade);
            const disponivel=item.tecnico_id?Number(item.estoque_tecnico):Number(item.estoque);
            if (disponivel < quantidade) {
              const error = new Error(`Estoque insuficiente para ${item.nome}. Disponível: ${disponivel}.`);
              error.status = 422; throw error;
            }
            if(item.tecnico_id) await client.query('UPDATE estoque_tecnico SET quantidade=quantidade-$1,updated_at=NOW() WHERE tecnico_id=$2 AND produto_id=$3',[quantidade,os.tecnico_id,item.referencia_id]);
            else await client.query('UPDATE produtos SET estoque=estoque-$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3',[quantidade,item.referencia_id,usuario.empresa_id]);
            await client.query(
              `INSERT INTO estoque_movimentos (empresa_id,produto_id,tipo,quantidade,observacao,os_id,usuario_id)
               VALUES ($1,$2,'SAIDA',$3,$4,$5,$6)`,
              [usuario.empresa_id, item.referencia_id, quantidade, `Baixa automática da O.S. #${id}`, id, usuario.usuario_id]);
            await client.query('UPDATE os_itens SET estoque_baixado=TRUE WHERE id=$1', [item.id]);
          }
        }
        const result = await client.query(
          `UPDATE ordens_servico SET status = $1::varchar,
             finalizado_em = CASE WHEN $1::varchar = 'FINALIZADA' THEN NOW() ELSE finalizado_em END,
             iniciado_em = CASE WHEN $1::varchar = 'EM_ANDAMENTO' THEN COALESCE(iniciado_em, NOW()) ELSE iniciado_em END,
             updated_at = NOW()
           WHERE id = $2 AND empresa_id = $3 RETURNING *`,
          [novoStatus, id, usuario.empresa_id]
        );
        await OsModel.registrarHistorico({
          osId: id, statusAnterior: os.status, statusNovo: novoStatus,
          usuarioId: usuario.usuario_id,
        }, client);
        return result.rows[0];
      });

      let pdfUrl = null;
      if (novoStatus === 'FINALIZADA') {
        const dados = await OsModel.buscarDadosCompletosParaPdf(id, usuario.empresa_id);
        const [fotos, checklist, medicoes, itens] = await Promise.all([db.query(
          `SELECT tipo,url,comentario,latitude,longitude,capturada_em FROM os_fotos f JOIN ordens_servico os ON os.id = f.os_id
           WHERE f.os_id = $1 AND os.empresa_id = $2 ORDER BY f.created_at`,
          [id, usuario.empresa_id]
        ), db.query('SELECT item,conforme,observacao FROM os_checklist_respostas WHERE os_id=$1 ORDER BY id', [id]),
        db.query('SELECT * FROM os_medicoes WHERE os_id=$1', [id]),
        db.query('SELECT tipo,descricao,quantidade,valor_unitario FROM os_itens WHERE os_id=$1 ORDER BY id', [id])]);
        dados.checklist = checklist.rows; dados.medicoes = medicoes.rows[0] || {}; dados.itens = itens.rows;
        pdfUrl = await PdfService.gerarOsPdf(dados, fotos.rows);
        await db.query('UPDATE ordens_servico SET pdf_url = $1 WHERE id = $2 AND empresa_id = $3',
          [pdfUrl, id, usuario.empresa_id]);
        if (dados.telefone_whatsapp && WhatsAppService.configurado()) {
          void WhatsAppService.enviarPdfOs(dados.telefone_whatsapp, dados.cliente_nome, pdfUrl);
        }
      }
      return res.json({ mensagem: `O.S. atualizada para ${novoStatus}.`, os: atualizada, pdf_url: pdfUrl });
    } catch (error) {
      console.error('Erro ao atualizar O.S.:', error.message);
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao atualizar a O.S.' });
    }
  }

  async listarAgenda(req, res) {
    const filtros = ['HOJE', 'ATRASADAS', 'PROXIMAS', 'TODAS'];
    const filtro = String(req.query.filtro || 'HOJE').toUpperCase();
    if (!filtros.includes(filtro)) return res.status(400).json({ erro: 'Filtro de agenda inválido.' });
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim().slice(0, 100) : '';
    try {
      const agenda = await OsModel.listarAgenda(req.usuarioLogado.usuario_id, req.usuarioLogado.empresa_id, filtro, busca);
      return res.json(agenda);
    } catch (error) {
      console.error('Erro ao listar agenda:', error.message);
      return res.status(500).json({ erro: 'Falha ao buscar a agenda.' });
    }
  }

  async detalhes(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
    try {
      const os = await OsModel.buscarDetalhes(id, req.usuarioLogado.empresa_id);
      if (!os) return res.status(404).json({ erro: 'O.S. não encontrada.' });
      if (!gestor(req.usuarioLogado.perfil) && os.tecnico_id !== req.usuarioLogado.usuario_id) return res.status(403).json({ erro: 'Acesso negado.' });
      return res.json(os);
    } catch (error) {
      console.error('Erro ao detalhar O.S.:', error.message);
      return res.status(500).json({ erro: 'Falha ao carregar detalhes da O.S.' });
    }
  }

  async salvarExecucao(req, res) {
    const id = Number(req.params.id); const usuario = req.usuarioLogado;
    try {
      const total = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os) { const e = new Error('O.S. não encontrada.'); e.status = 404; throw e; }
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id) { const e = new Error('Acesso negado.'); e.status = 403; throw e; }
        if (os.status !== 'EM_ANDAMENTO') { const e = new Error('A O.S. precisa estar em andamento.'); e.status = 409; throw e; }
        const fotos = await client.query("SELECT COUNT(*)::int total FROM os_fotos WHERE os_id=$1 AND tipo IN ('ANTES','DEPOIS','EVIDENCIA')", [id]);
        if (fotos.rows[0].total < 2) { const e = new Error('Registre pelo menos duas fotos do atendimento antes do relatório.'); e.status = 422; throw e; }
        const regras=await client.query(`SELECT item,obrigatorio,exige_observacao_nao_conforme,exige_foto,medicao_campo,valor_minimo,valor_maximo FROM checklist_modelos WHERE tipo_servico=$1 AND ativo=TRUE AND (empresa_id=$2 OR (empresa_id IS NULL AND NOT EXISTS(SELECT 1 FROM checklist_modelos x WHERE x.empresa_id=$2 AND x.tipo_servico=$1 AND x.ativo=TRUE)))`,[os.tipo_servico,usuario.empresa_id]);
        for(const regra of regras.rows){const resposta=req.body.checklist.find(x=>x.item===regra.item);if(regra.obrigatorio&&!resposta)throw Object.assign(new Error(`Responda o item: ${regra.item}.`),{status:422});if(resposta&&resposta.conforme===false&&regra.exige_observacao_nao_conforme&&!resposta.observacao)throw Object.assign(new Error(`Descreva a não conformidade: ${regra.item}.`),{status:422});if(regra.exige_foto&&fotos.rows[0].total<1)throw Object.assign(new Error(`O item ${regra.item} exige evidência fotográfica.`),{status:422});if(regra.medicao_campo){const valor=Number(req.body.medicoes[regra.medicao_campo]);if(Number.isFinite(valor)&&((regra.valor_minimo!==null&&valor<Number(regra.valor_minimo))||(regra.valor_maximo!==null&&valor>Number(regra.valor_maximo))))throw Object.assign(new Error(`${regra.item}: medição fora da faixa configurada.`),{status:422});}}
        const valor = await OsModel.salvarExecucao(id, usuario.empresa_id, req.body, client);
        await OsModel.registrarHistorico({ osId: id, statusAnterior: os.status, statusNovo: os.status,
          usuarioId: usuario.usuario_id, observacao: 'Relatório técnico atualizado' }, client);
        return valor;
      });
      return res.json({ mensagem: 'Relatório técnico salvo.', valor_total: total });
    } catch (error) {
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao salvar relatório técnico.' });
    }
  }

  async registrarEvento(req, res) {
    const id = Number(req.params.id); const usuario = req.usuarioLogado;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
    try {
      const atualizada = await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, usuario.empresa_id, client);
        if (!os) throw Object.assign(new Error('O.S. não encontrada.'), { status: 404 });
        if (!gestor(usuario.perfil) && os.tecnico_id !== usuario.usuario_id) throw Object.assign(new Error('Acesso negado.'), { status: 403 });
        const { evento, latitude, longitude, motivo } = req.body;
        if (evento === 'A_CAMINHO' && os.status !== 'ABERTA') throw Object.assign(new Error('A O.S. precisa estar aberta.'), { status: 409 });
        if (evento === 'CHECKIN' && os.status !== 'ABERTA') throw Object.assign(new Error('Check-in permitido apenas em O.S. aberta.'), { status: 409 });
        if (evento === 'CHECKOUT' && os.status !== 'EM_ANDAMENTO') throw Object.assign(new Error('Check-out permitido apenas em atendimento.'), { status: 409 });
        if (evento === 'PAUSAR' && (os.status !== 'EM_ANDAMENTO' || os.pausado_em)) throw Object.assign(new Error('A O.S. não pode ser pausada agora.'), { status: 409 });
        if (evento === 'RETOMAR' && (os.status !== 'EM_ANDAMENTO' || !os.pausado_em)) throw Object.assign(new Error('A O.S. não está pausada.'), { status: 409 });
        if (evento === 'PAUSAR') await client.query('INSERT INTO os_pausas(os_id,usuario_id,motivo) VALUES($1,$2,$3)',[id,usuario.usuario_id,motivo||null]);
        if (evento === 'RETOMAR') await client.query('UPDATE os_pausas SET retomado_em=NOW() WHERE id=(SELECT id FROM os_pausas WHERE os_id=$1 AND retomado_em IS NULL ORDER BY iniciado_em DESC LIMIT 1)',[id]);
        const atualizacoes = {
          A_CAMINHO: ['a_caminho_em=COALESCE(a_caminho_em,NOW())', []],
          CHECKIN: ['checkin_em=COALESCE(checkin_em,NOW()),checkin_latitude=$1,checkin_longitude=$2,status=\'EM_ANDAMENTO\',iniciado_em=COALESCE(iniciado_em,NOW())', [latitude, longitude]],
          CHECKOUT: ['checkout_em=COALESCE(checkout_em,NOW()),checkout_latitude=$1,checkout_longitude=$2', [latitude, longitude]],
          PAUSAR: ['pausado_em=NOW()', []],
          RETOMAR: ['total_pausa_segundos=total_pausa_segundos+GREATEST(EXTRACT(EPOCH FROM(NOW()-pausado_em))::int,0),pausado_em=NULL', []],
        };
        const [sql, valores] = atualizacoes[evento];
        valores.push(id, usuario.empresa_id);
        const result = await client.query(`UPDATE ordens_servico SET ${sql},updated_at=NOW() WHERE id=$${valores.length - 1} AND empresa_id=$${valores.length} RETURNING *`, valores);
        await OsModel.registrarHistorico({ osId: id, statusAnterior: os.status,
          statusNovo: evento === 'CHECKIN' ? 'EM_ANDAMENTO' : os.status, usuarioId: usuario.usuario_id,
          observacao: evento === 'A_CAMINHO' ? 'Técnico a caminho' : evento === 'CHECKIN' ? 'Check-in realizado com GPS' : 'Check-out realizado com GPS' }, client);
        return result.rows[0];
      });
      return res.json({ mensagem: 'Evento registrado.', os: atualizada });
    } catch (error) { return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao registrar evento.' }); }
  }

  async criarRetorno(req,res) {
    const id=Number(req.params.id),usuario=req.usuarioLogado;
    if(!req.body.agendado_para||Number.isNaN(Date.parse(req.body.agendado_para)))return res.status(400).json({erro:'Data do retorno inválida.'});
    try {
      const nova=await db.transaction(async client=>{
        const origem=await OsModel.buscarPorId(id,usuario.empresa_id,client);
        if(!origem)throw Object.assign(new Error('O.S. não encontrada.'),{status:404});
        if(!gestor(usuario.perfil)&&origem.tecnico_id!==usuario.usuario_id)throw Object.assign(new Error('Acesso negado.'),{status:403});
        const motivo=String(req.body.motivo||`Retorno da O.S. #${id}`).trim().slice(0,1000);
        const r=await client.query(`INSERT INTO ordens_servico(empresa_id,cliente_id,aparelho_id,tecnico_id,tipo_servico,descricao_problema,agendado_para,retorno_de_os_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[usuario.empresa_id,origem.cliente_id,origem.aparelho_id,origem.tecnico_id,origem.tipo_servico,motivo,req.body.agendado_para,id]);
        await client.query("UPDATE ordens_servico SET retorno_necessario=TRUE,situacao_pendencia='RETORNO_AGENDADO',motivo_pendencia=$1,updated_at=NOW() WHERE id=$2",[motivo,id]);
        await OsModel.registrarHistorico({osId:id,statusAnterior:origem.status,statusNovo:origem.status,usuarioId:usuario.usuario_id,observacao:`Retorno agendado na O.S. #${r.rows[0].id}`},client);
        return r.rows[0];
      });
      void PushService.enviar(nova.tecnico_id,'Visita de retorno',`Retorno #${nova.id} agendado.`,{os_id:nova.id});
      return res.status(201).json(nova);
    } catch(e) { return res.status(e.status||500).json({erro:e.status?e.message:'Falha ao criar retorno.'}); }
  }

  async listarTodas(req, res) {
    try {
      return res.json(await OsModel.listarTodas(req.usuarioLogado.empresa_id));
    } catch (error) {
      return res.status(500).json({ erro: 'Falha ao listar ordens de serviço.' });
    }
  }

  async listarFinalizadas(req, res) {
    try {
      const busca = typeof req.query.busca === 'string' ? req.query.busca.slice(0, 100) : '';
      return res.json(await OsModel.listarFinalizadas(req.usuarioLogado.empresa_id, busca));
    } catch (error) {
      console.error('Erro ao listar O.S. finalizadas:', error.message);
      return res.status(500).json({ erro: 'Falha ao listar ordens finalizadas.' });
    }
  }

  async reagendar(req, res) {
    if (!gestor(req.usuarioLogado.perfil)) return res.status(403).json({ erro: 'Acesso restrito a gestores.' });
    const id = Number(req.params.id);
    try {
      await db.transaction(async (client) => {
        const os = await OsModel.buscarPorId(id, req.usuarioLogado.empresa_id, client);
        if (!os) {
          const error = new Error('O.S. não encontrada.'); error.status = 404; throw error;
        }
        const rel = await OsModel.validarRelacionamentos({
          empresaId: req.usuarioLogado.empresa_id, clienteId: os.cliente_id,
          aparelhoId: os.aparelho_id, tecnicoId: req.body.tecnico_id,
        }, client);
        if (!rel.valido) { const error = new Error('Técnico inválido.'); error.status = 400; throw error; }
        await client.query(
          'UPDATE ordens_servico SET tecnico_id = $1, agendado_para = $2, updated_at = NOW() WHERE id = $3 AND empresa_id = $4',
          [req.body.tecnico_id, req.body.agendado_para, id, req.usuarioLogado.empresa_id]
        );
        await OsModel.registrarHistorico({ osId: id, statusAnterior: os.status, statusNovo: os.status,
          usuarioId: req.usuarioLogado.usuario_id, observacao: `Reagendada para ${req.body.agendado_para}` }, client);
      });
      void PushService.enviar(req.body.tecnico_id, 'Atendimento reagendado', `A O.S. #${id} foi incluída na sua agenda.`, { os_id:id });
      return res.json({ mensagem: 'O.S. reagendada.' });
    } catch (error) {
      return res.status(error.status || 500).json({ erro: error.status ? error.message : 'Falha ao reagendar.' });
    }
  }

  async agendarVisita(req,res){
    const id=Number(req.params.id),usuario=req.usuarioLogado,quando=req.body.agendado_para;
    if(!Number.isInteger(id)||!quando||Number.isNaN(Date.parse(quando)))return res.status(400).json({erro:'Data e horário inválidos.'});
    try{const atualizada=await db.transaction(async client=>{const os=await OsModel.buscarPorId(id,usuario.empresa_id,client);if(!os)throw Object.assign(new Error('O.S. não encontrada.'),{status:404});if(!gestor(usuario.perfil)&&os.tecnico_id!==usuario.usuario_id)throw Object.assign(new Error('Acesso negado.'),{status:403});if(['FINALIZADA','CANCELADA'].includes(os.status))throw Object.assign(new Error('Não é possível agendar uma O.S. encerrada.'),{status:409});const r=await client.query('UPDATE ordens_servico SET agendado_para=$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3 RETURNING *',[quando,id,usuario.empresa_id]);await OsModel.registrarHistorico({osId:id,statusAnterior:os.status,statusNovo:os.status,usuarioId:usuario.usuario_id,observacao:`Visita agendada para ${quando}`},client);return r.rows[0]});void PushService.enviar(atualizada.tecnico_id,'Visita agendada',`A O.S. #${id} foi agendada.`,{os_id:id});return res.json({mensagem:'Visita agendada.',os:atualizada})}catch(e){return res.status(e.status||500).json({erro:e.status?e.message:'Falha ao agendar visita.'})}
  }
}

module.exports = new OsController();
