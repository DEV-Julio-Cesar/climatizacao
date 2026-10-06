const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.resolve(__dirname, '..', '..', 'tmp', 'uploads');

class PdfService {
  async gerarOsPdf(os, fotos) {
    if (!os) throw new Error('Dados da O.S. não encontrados para gerar PDF.');
    return new Promise((resolve, reject) => {
      const filename = `os_${os.id}_${Date.now()}.pdf`;
      const output = path.join(uploadsDir, filename);
      const doc = new PDFDocument({ margin: 45, size: 'A4' });
      const stream = fs.createWriteStream(output);
      stream.on('error', reject);
      const publicUrl = process.env.APP_URL || (process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : 'http://localhost:3000');
      stream.on('finish', () => resolve(`${publicUrl}/uploads/${filename}`));
      doc.on('error', reject);
      doc.pipe(stream);

      doc.fontSize(20).text('Ordem de Serviço', { align: 'center' }).moveDown();
      doc.fontSize(11)
        .text(`Empresa: ${os.empresa_nome}`)
        .text(`O.S. nº: ${os.id}`)
        .text(`Técnico: ${os.tecnico_nome}`)
        .text(`Finalizada em: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(os.finalizado_em))}`)
        .moveDown();
      doc.fontSize(14).text('Cliente', { underline: true });
      doc.fontSize(11).text(`Nome: ${os.cliente_nome}`).text(`Endereço: ${os.cliente_endereco || '-'}`).moveDown();
      doc.fontSize(14).text('Serviço', { underline: true });
      doc.fontSize(11)
        .text(`Tipo: ${os.tipo_servico}`)
        .text(`Solicitação: ${os.descricao_problema}`)
        .text(`Diagnóstico: ${os.diagnostico || '-'}`)
        .text(`Solução aplicada: ${os.solucao_aplicada || '-'}`)
        .text(`Recomendações: ${os.recomendacoes || '-'}`)
        .text(`Garantia: ${os.garantia_dias || 0} dias`)
        .text(`Retorno necessário: ${os.retorno_necessario ? 'Sim' : 'Não'}`)
        .text(`Valor total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(os.valor_total || 0)}`);

      if (os.checklist?.length) {
        doc.moveDown().fontSize(14).text('Checklist técnico', { underline: true }).moveDown(.4);
        os.checklist.forEach((item) => doc.fontSize(10).text(`${item.conforme ? '[OK]' : '[NÃO CONFORME]'} ${item.item}${item.observacao ? ` - ${item.observacao}` : ''}`));
      }
      const medidas = [
        ['Temperatura de retorno', os.medicoes?.temperatura_retorno, '°C'], ['Temperatura de insuflamento', os.medicoes?.temperatura_insuflamento, '°C'],
        ['Tensão', os.medicoes?.tensao, 'V'], ['Corrente', os.medicoes?.corrente, 'A'], ['Pressão baixa', os.medicoes?.pressao_baixa, 'psi'],
        ['Pressão alta', os.medicoes?.pressao_alta, 'psi'], ['Umidade', os.medicoes?.umidade, '%'], ['Gás', os.medicoes?.tipo_gas, ''],
      ].filter(([, valor]) => valor !== null && valor !== undefined && valor !== '');
      if (medidas.length) {
        doc.moveDown().fontSize(14).text('Medições', { underline: true }).moveDown(.4);
        medidas.forEach(([nome, valor, unidade]) => doc.fontSize(10).text(`${nome}: ${valor} ${unidade}`));
      }
      if (os.itens?.length) {
        doc.moveDown().fontSize(14).text('Serviços e peças', { underline: true }).moveDown(.4);
        os.itens.forEach((item) => doc.fontSize(10).text(`${item.tipo} - ${item.descricao} | ${item.quantidade} x ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario)}`));
      }

      const anexos = fotos.map((foto) => {
        try {
          const pathname = new URL(foto.url).pathname;
          const candidate = path.join(uploadsDir, path.basename(pathname));
          return fs.existsSync(candidate) ? { ...foto, path: candidate } : null;
        } catch (_error) { return null; }
      }).filter(Boolean);

      if (anexos.length) {
        doc.addPage().fontSize(14).text('Registros e assinatura', { underline: true }).moveDown();
        for (const anexo of anexos) {
          if (doc.y > 620) doc.addPage();
          doc.fontSize(11).text(anexo.tipo);
          try { doc.image(anexo.path, { fit: [480, 260], align: 'center' }).moveDown(); }
          catch (_error) { doc.text('Não foi possível renderizar esta imagem.').moveDown(); }
        }
      }
      doc.end();
    });
  }
}

module.exports = new PdfService();
