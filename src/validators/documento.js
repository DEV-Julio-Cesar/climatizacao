const normalizar = valor => String(valor || '').trim().toUpperCase().replace(/[.\/\-\s]/g, '');
function validarDocumento(valor, tipo) {
  const n = normalizar(valor);
  const cpf = /^\d{11}$/.test(n);
  if ((tipo === 'CPF' && !cpf) || (tipo === 'CNPJ' && !/^[A-Z0-9]{12}\d{2}$/.test(n))) return false;
  if (!cpf && !/^[A-Z0-9]{12}\d{2}$/.test(n)) return false;
  if (/^(.)\1+$/.test(n)) return false;
  const digito = (base, pesos) => {
    const soma = [...base].reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * pesos[i], 0);
    return soma % 11 < 2 ? 0 : 11 - soma % 11;
  };
  const base = n.slice(0, -2);
  const p1 = cpf ? [10,9,8,7,6,5,4,3,2] : [5,4,3,2,9,8,7,6,5,4,3,2];
  const p2 = cpf ? [11,10,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
  const d1 = digito(base, p1);
  return n.endsWith(`${d1}${digito(base + d1, p2)}`);
}
module.exports = { normalizar, validarDocumento };
