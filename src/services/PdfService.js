const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.resolve(__dirname, '..', '..', 'tmp', 'uploads');

class PdfService {
  async gerarOrcamentoPdf(o) {
    return new Promise((resolve,reject)=>{
      const doc=new PDFDocument({margin:45,size:'A4'}),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
      const moeda=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
      doc.fillColor('#087a9b').fontSize(22).text(o.empresa_nome||'ClimaSaaS').fillColor('#111').fontSize(16).text(`Orçamento nº ${o.id}`,{align:'right'}).moveDown();
      doc.fontSize(10).fillColor('#52606d').text([o.empresa_cnpj,o.empresa_telefone,o.empresa_email].filter(Boolean).join(' · ')).fillColor('#111').moveDown();
      doc.fontSize(13).text('Cliente',{underline:true}).fontSize(10).text(`Nome: ${o.cliente_nome}`).text(`CPF/CNPJ: ${o.cliente_documento||'-'}`).text(`Telefone: ${o.cliente_telefone||'-'}`).text(`Endereço: ${[o.cliente_endereco,o.cliente_numero,o.cliente_cidade,o.cliente_estado].filter(Boolean).join(', ')||'-'}`).moveDown();
      doc.fontSize(13).text('Itens do orçamento',{underline:true}).moveDown(.5);o.itens.forEach((i,n)=>doc.fontSize(10).text(`${n+1}. ${i.descricao}`).text(`   ${i.quantidade} x ${moeda(i.valor_unitario)} = ${moeda(Number(i.quantidade)*Number(i.valor_unitario))}`).moveDown(.3));
      doc.moveDown().fontSize(10).text(`Subtotal: ${moeda(o.subtotal)}`,{align:'right'}).text(`Desconto: ${moeda(o.desconto)}`,{align:'right'}).fontSize(14).text(`Total: ${moeda(o.total)}`,{align:'right'});
      if(o.validade)doc.moveDown().fontSize(10).text(`Validade: ${new Date(`${String(o.validade).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR')}`);
      if(o.observacoes)doc.moveDown().fontSize(11).text('Observações',{underline:true}).fontSize(10).text(o.observacoes);
      doc.moveDown(2).fontSize(9).fillColor('#52606d').text('Documento gerado pelo ClimaSaaS.',{align:'center'});doc.end();
    });
  }
  async gerarOsPdf(os, fotos) {
    if (!os) throw new Error('Dados da O.S. não encontrados para gerar PDF.');
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 45, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

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
        .text(`Tempo efetivo: ${os.iniciado_em && os.finalizado_em ? Math.max(0, Math.round((new Date(os.finalizado_em)-new Date(os.iniciado_em))/60000-(os.total_pausa_segundos||0)/60)) : 0} minutos`)
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
        if (foto.conteudo) return { ...foto, path: foto.conteudo };
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
          doc.fontSize(11).text(anexo.tipo === 'ASSINATURA' ? 'Assinatura do cliente' : `Evidência${anexo.comentario ? ` — ${anexo.comentario}` : ''}`);
          if(anexo.capturada_em)doc.fontSize(9).fillColor('#52606D').text(`Capturada em ${new Date(anexo.capturada_em).toLocaleString('pt-BR')}${anexo.latitude ? ` · GPS ${anexo.latitude}, ${anexo.longitude}` : ''}`).fillColor('#000');
          try { doc.image(anexo.path, { fit: [480, 260], align: 'center' }).moveDown(); }
          catch (_error) { doc.text('Não foi possível renderizar esta imagem.').moveDown(); }
        }
      }
      doc.end();
    });
  }
}

module.exports = new PdfService();
