export const FORNECEDOR_VAZIO = { nome:"", cpf_cnpj:"", telefone:"", email:"", cep:"", endereco:"", numero:"", cidade:"", estado:"", observacoes:"", ativo:true };
export const COMPRA_VAZIA = { fornecedor_id:"", numero_documento:"", previsao:"", observacoes:"", itens:[] };
export function money(valor) { return Number(valor || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
export function date(valor) { return new Date(valor).toLocaleDateString("pt-BR"); }
export function doc(valor) { const numero=String(valor || ""); return numero.length === 11 ? numero.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : numero; }
export function phone(valor) { const numero=String(valor || ""); return numero.length === 11 ? numero.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : numero; }
