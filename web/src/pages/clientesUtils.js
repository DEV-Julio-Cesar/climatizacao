export function pick(data, shape) {
  return { id: data.id, ...Object.fromEntries(Object.keys(shape).map(chave => [chave, data[chave] ?? shape[chave]])) };
}
export function numOrNull(valor) { return valor === "" || valor === null || !Number.isFinite(Number(valor)) ? null : Number(valor); }
export function digitos(valor) { return String(valor || "").replace(/\D/g, ""); }
export function mascaraCep(valor) { return digitos(valor).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2"); }
export function mascaraTelefone(valor) {
  const numero = digitos(valor).slice(0, 13);
  const br = numero.startsWith("55") && numero.length > 11 ? numero.slice(2) : numero;
  return br.length > 10 ? br.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : br.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
}
export function mascaraDocumento(valor) {
  const numero = digitos(valor).slice(0, 14);
  return numero.length <= 11
    ? numero.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    : numero.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
export function documentoValido(valor) {
  const numero = digitos(valor);
  if (!numero) return true;
  if (![11, 14].includes(numero.length) || /^(\d)\1+$/.test(numero)) return false;
  const calcular = (base, pesos) => { const resto = base.split("").reduce((soma, item, i) => soma + Number(item) * pesos[i], 0) % 11; return resto < 2 ? 0 : 11 - resto; };
  if (numero.length === 11) {
    const primeiro = calcular(numero.slice(0, 9), [10,9,8,7,6,5,4,3,2]);
    const segundo = calcular(numero.slice(0, 9) + primeiro, [11,10,9,8,7,6,5,4,3,2]);
    return numero.endsWith(`${primeiro}${segundo}`);
  }
  const primeiro = calcular(numero.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const segundo = calcular(numero.slice(0, 12) + primeiro, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return numero.endsWith(`${primeiro}${segundo}`);
}
export function enderecoCompleto(cliente) {
  const linha = [cliente.endereco, cliente.numero].filter(Boolean).join(", ");
  return [linha, cliente.complemento, cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(" · ");
}
export function temCoordenadas(valor) { return Number.isFinite(Number(valor?.latitude)) && Number.isFinite(Number(valor?.longitude)); }
export function money(valor) { return Number(valor || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
export function label(valor) { return String(valor || "").replaceAll("_", " "); }
