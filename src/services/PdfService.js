const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PdfService {
  async gerarOsPdf(osDados, fotos) {
    return new Promise((resolve, reject) => {
      try {
        // Define o caminho onde o PDF será salvo temporariamente
        const pdfFileName = `os_${osDados.id}_${Date.now()}.pdf`;
        const pdfPath = path.resolve(__dirname, '..', '..', 'tmp', 'uploads', pdfFileName);
        
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // --- Cabeçalho ---
        doc.fontSize(20).text('Ordem de Serviço', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Empresa: ${osDados.empresa_nome}`);
        doc.text(`O.S. Nº: ${osDados.id}`);
        doc.text(`Data de Finalização: ${new Date(osDados.finalizado_em).toLocaleDateString()}`);
        doc.moveDown();

        // --- Dados do Cliente ---
        doc.fontSize(14).text('Dados do Cliente', { underline: true });
        doc.fontSize(12).text(`Nome: ${osDados.cliente_nome}`);
        doc.text(`Endereço: ${osDados.cliente_endereco}`);
        doc.moveDown();

        // --- Dados do Serviço ---
        doc.fontSize(14).text('Detalhes do Serviço', { underline: true });
        doc.fontSize(12).text(`Tipo: ${osDados.tipo_servico}`);
        doc.text(`Descrição/Laudo: ${osDados.descricao_problema}`);
        doc.text(`Valor Total: R$ ${osDados.valor_total}`);
        doc.moveDown();

        // --- Anexos e Assinatura ---
        // (Nota: Em um ambiente real, você faria o download das imagens pelas URLs
        //  presentes no array 'fotos' antes de tentar embutir no PDF.)
        doc.addPage();
        doc.fontSize(14).text('Registro Fotográfico', { underline: true });
        doc.moveDown();
        
        doc.fontSize(10).text('(As imagens "Antes", "Depois" e a "Assinatura" ficariam renderizadas aqui)');

        // Finaliza o desenho do PDF
        doc.end();

        // Retorna a URL pública assim que o arquivo terminar de ser gravado
        stream.on('finish', () => {
          const pdfUrl = `${process.env.APP_URL}/uploads/${pdfFileName}`;
          resolve(pdfUrl);
        });

      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new PdfService();