const db = require('../config/database');
const OsModel = require('../models/OsModel');
const PdfService = require('../services/PdfService');
const WhatsAppService = require('../services/WhatsAppService');

class OsController {

  // Cria uma nova Ordem de Serviço
  async criar(req, res) {
    // A validação rigorosa com ZOD já aconteceu no middleware, garantindo a segurança destes dados
    const { empresa_id, cliente_id, aparelho_id, tecnico_id, tipo_servico, descricao_problema } = req.body;

    try {
      // 1. Salva a O.S. no banco
      const novaOs = await OsModel.criar({
        empresa_id, cliente_id, aparelho_id, tecnico_id, tipo_servico, descricao_problema
      });

      // 2. Registra a criação no histórico inalterável
      await OsModel.registrarHistorico(
        novaOs.id,
        null,          // Não havia status anterior
        novaOs.status, // Geralmente 'ABERTA'
        tecnico_id     // Quem gerou a ação
      );

      return res.status(201).json({
        mensagem: 'Ordem de serviço gerada e registrada no histórico com sucesso.',
        os: novaOs
      });

    } catch (erro) {
      console.error('Erro na criação da O.S.:', erro);
      return res.status(500).json({ erro: 'Falha interna ao comunicar com o banco de dados.' });
    }
  }

  // Atualiza o status da O.S. e, se finalizada, gera o PDF e dispara o WhatsApp
  async atualizarStatus(req, res) {
    const { id } = req.params;       // ID da O.S. vem na URL
    const { novo_status } = req.body;

    // Puxa os dados do técnico direto da assinatura criptografada do token
    const { usuario_id, empresa_id } = req.usuarioLogado;

    try {
      // 1. Busca a O.S. garantindo que ela pertence à empresa do técnico (Multi-Tenant)
      const os = await OsModel.buscarPorId(id, empresa_id);

      if (!os) {
        return res.status(404).json({ erro: 'O.S. não encontrada ou acesso negado.' });
      }

      const statusAnterior = os.status;

      // 2. Atualiza a tabela principal
      const queryAtualiza = `
        UPDATE ordens_servico 
        SET status = $1, finalizado_em = NOW() 
        WHERE id = $2
      `;
      await db.query(queryAtualiza, [novo_status, id]);

      // 3. Grava o rastro de auditoria (Histórico)
      await OsModel.registrarHistorico(id, statusAnterior, novo_status, usuario_id);

      // 4. Disparo mágico: só executa quando o status vai para FINALIZADA
      if (novo_status === 'FINALIZADA') {
        // A. Busca todos os dados com JOIN (nomes de cliente, empresa, etc.)
        const osCompleta = await OsModel.buscarDadosCompletosParaPdf(id);

        // B. Busca as fotos vinculadas à O.S.
        const fotosResult = await db.query(
          `SELECT * FROM os_fotos WHERE os_id = $1`,
          [id]
        );

        // C. Gera o PDF e aguarda o arquivo ser gravado antes de continuar
        const pdfUrl = await PdfService.gerarOsPdf(osCompleta, fotosResult.rows);

        // D. Dispara a mensagem no WhatsApp do cliente (falha silenciosa — não quebra a API)
        WhatsAppService.enviarPdfOs(
          osCompleta.telefone_whatsapp,
          osCompleta.cliente_nome,
          pdfUrl
        );
      }

      return res.status(200).json({
        mensagem: `O.S. atualizada para ${novo_status} com sucesso.`
      });

    } catch (erro) {
      console.error('Erro ao atualizar status da O.S.:', erro);
      return res.status(500).json({ erro: 'Falha ao atualizar status da O.S.' });
    }
  }
  // Lista as visitas do técnico autenticado
  async listarAgenda(req, res) {
    // Puxa o ID do técnico e da empresa direto do token JWT (Segurança Multi-Tenant)
    const { usuario_id, empresa_id } = req.usuarioLogado; 

    try {
      const agenda = await OsModel.listarAgendaDoTecnico(usuario_id, empresa_id);
      
      return res.status(200).json(agenda);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ erro: 'Falha ao buscar a agenda do dia.' });
    }
  }
  // Reagendar ou trocar de técnico (Usado pelo Painel Web)
  async reagendar(req, res) {
    const { id } = req.params;
    const { tecnico_id, agendado_para } = req.body;
    const { usuario_id, empresa_id } = req.usuarioLogado; // Aqui é o GESTOR que está logado

    try {
      const os = await OsModel.buscarPorId(id, empresa_id);
      if (!os) return res.status(404).json({ erro: 'O.S. não encontrada.' });

      const query = `
        UPDATE ordens_servico 
        SET tecnico_id = $1, agendado_para = $2 
        WHERE id = $3
      `;
      await db.query(query, [tecnico_id, agendado_para, id]);

      // Princípio Não-Destrutivo: Registramos a ação do Gestor
      await OsModel.registrarHistorico(
        id, 
        os.status, 
        os.status, 
        usuario_id, 
        `Gestor reagendou a visita para ${agendado_para}`
      );

      return res.status(200).json({ mensagem: 'O.S. reagendada com sucesso.' });
    } catch (erro) {
      return res.status(500).json({ erro: 'Falha ao reagendar.' });
    }
  }
}

module.exports = new OsController();
