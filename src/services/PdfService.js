const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.resolve(__dirname, '..', '..', 'tmp', 'uploads');

class PdfService {
  async gerarOrcamentoPdf(o) {
    return new Promise((resolve,reject)=>{
      const doc=new PDFDocument({margin:45,size:'A4',bufferPages:true}),chunks=[];
      doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
      const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      const largura=doc.page.width-90,limite=doc.page.height-80;
      const espaco=h=>{if(doc.y+h>limite)doc.addPage();};
      doc.font('Helvetica-Bold').fillColor('#087a9b').fontSize(20).text(o.empresa_nome_fantasia||o.empresa_nome||'Empresa',45,45,{width:largura});
      doc.font('Helvetica').fontSize(10).fillColor('#334155');
      if(o.empresa_nome_fantasia&&o.empresa_nome)doc.text(o.empresa_nome);
      doc.text([o.empresa_cnpj?`CNPJ: ${o.empresa_cnpj}`:'',o.empresa_telefone,o.empresa_email].filter(Boolean).join(' | '));
      const endereco=[o.empresa_endereco,o.empresa_cidade,o.empresa_estado,o.empresa_cep].filter(Boolean).join(', ');
      if(endereco)doc.text(endereco);
      doc.moveDown().font('Helvetica-Bold').fontSize(17).fillColor('#132a3a').text(`Orcamento n. ${o.id}`);
      if(o.created_at)doc.font('Helvetica').fontSize(10).text(`Emissao: ${new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(o.created_at))?o.created_at+'T12:00:00':o.created_at).toLocaleDateString('pt-BR')}`);
      if(o.validade){const data=o.validade instanceof Date?o.validade:new Date(String(o.validade).slice(0,10)+'T12:00:00');doc.font('Helvetica').fontSize(10).text(`Validade: ${data.toLocaleDateString('pt-BR')}`);}
      doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Destinatario');
      doc.font('Helvetica').fontSize(10).text(o.cliente_nome||'-');
      if(o.cliente_telefone)doc.text(`Telefone: ${o.cliente_telefone}`);
      if(o.cliente_email)doc.text(`E-mail: ${o.cliente_email}`);
      const destino=[o.cliente_endereco,o.cliente_numero,o.cliente_cidade,o.cliente_estado].filter(Boolean).join(', ');
      if(destino)doc.text(destino);
      doc.moveDown();
      const cabecalho=()=>{espaco(35);const y=doc.y;doc.rect(45,y,largura,25).fill('#edf5f7');doc.fillColor('#132a3a').font('Helvetica-Bold').fontSize(9);doc.text('Descricao',52,y+8,{width:250});doc.text('Qtd.',310,y+8,{width:45,align:'right'});doc.text('Unitario',365,y+8,{width:80,align:'right'});doc.text('Total',455,y+8,{width:85,align:'right'});doc.y=y+33;};
      cabecalho();
      for(const [n,i]of o.itens.entries()){
        const descricao=`${n+1}. ${i.descricao}`;doc.font('Helvetica').fontSize(10);
        const h=Math.max(28,doc.heightOfString(descricao,{width:245})+14);
        if(doc.y+h>limite){doc.addPage();cabecalho();}
        doc.font('Helvetica');
        const y=doc.y;
        doc.fillColor('#132a3a').text(descricao,52,y,{width:245});
        doc.fontSize(9).text(Number(i.quantidade).toLocaleString('pt-BR'),310,y,{width:45,align:'right'}).text(moeda(i.valor_unitario),365,y,{width:80,align:'right'}).text(moeda(Math.round(Number(i.quantidade)*Number(i.valor_unitario)*100)/100),455,y,{width:85,align:'right'});
        doc.moveTo(45,y+h-5).lineTo(45+largura,y+h-5).strokeColor('#dce7ec').stroke();doc.y=y+h;
      }
      espaco(100);doc.y+=12;doc.font('Helvetica').fontSize(11).text(`Subtotal: ${moeda(o.subtotal)}`,45,doc.y,{width:largura,align:'right'}).text(`Desconto: ${moeda(o.desconto)}`,{width:largura,align:'right'}).font('Helvetica-Bold').fontSize(15).fillColor('#087a9b').text(`Total: ${moeda(o.total)}`,{width:largura,align:'right'});
      if(o.observacoes){doc.font('Helvetica').fontSize(10);const h=doc.heightOfString(o.observacoes,{width:largura});espaco(Math.min(h+40,150));doc.moveDown().font('Helvetica-Bold').fillColor('#132a3a').fontSize(11).text('Observacoes');doc.font('Helvetica').fontSize(10).text(o.observacoes,{width:largura});}
      const pages=doc.bufferedPageRange();
      for(let n=0;n<pages.count;n++){doc.switchToPage(pages.start+n);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`Orcamento ${o.id} | Pagina ${n+1} de ${pages.count}`,45,doc.page.height-35,{width:largura,align:'center',lineBreak:false});doc.page.margins.bottom=bottom;}
      doc.end();
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
        .text(`O.S. nº: ${os.numero || os.id}`)
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
