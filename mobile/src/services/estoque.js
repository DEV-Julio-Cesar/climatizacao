export function numeroEstoque(valor, nome = 'Quantidade') {
  const texto = String(valor).trim().replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(texto)) throw new Error(`${nome}: informe um número positivo com até duas casas decimais.`);
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero > 9999999999.99) throw new Error(`${nome} acima do limite permitido.`);
  return numero;
}

export function prepararMovimento(tipo, quantidade, observacao) {
  if (!['ENTRADA', 'SAIDA', 'AJUSTE'].includes(tipo)) throw new Error('Selecione uma operação válida.');
  const valor = numeroEstoque(quantidade, tipo === 'AJUSTE' ? 'Novo saldo' : 'Quantidade');
  const motivo = observacao.trim();
  if (tipo !== 'AJUSTE' && valor === 0) throw new Error('Informe uma quantidade maior que zero.');
  if (!motivo) throw new Error('Informe o motivo da movimentação.');
  if (motivo.length > 300) throw new Error('O motivo deve ter no máximo 300 caracteres.');
  return { tipo, quantidade: valor, observacao: motivo };
}

export function saldoAposMovimento(saldo, movimento) {
  const atual = Math.round(Number(saldo) * 100);
  const quantidade = Math.round(movimento.quantidade * 100);
  return (movimento.tipo === 'AJUSTE' ? quantidade : atual + (movimento.tipo === 'SAIDA' ? -quantidade : quantidade)) / 100;
}
