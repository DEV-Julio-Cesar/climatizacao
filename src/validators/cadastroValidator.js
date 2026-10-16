const { z } = require('zod');

const texto = (max) => z.string().trim().max(max).optional().default('');
const data = z.union([z.string().date(), z.literal('')]).optional().default('');
const documentoValido = (valor) => {
  const n = String(valor || '').replace(/\D/g, '');
  if (!n) return true;
  if (![11, 14].includes(n.length) || /^(\d)\1+$/.test(n)) return false;
  const digito = (base, pesos) => {
    const soma = base.split('').reduce((total, atual, i) => total + Number(atual) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  if (n.length === 11) {
    const d1 = digito(n.slice(0, 9), [10,9,8,7,6,5,4,3,2]);
    const d2 = digito(n.slice(0, 9) + d1, [11,10,9,8,7,6,5,4,3,2]);
    return n.endsWith(`${d1}${d2}`);
  }
  const d1 = digito(n.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = digito(n.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return n.endsWith(`${d1}${d2}`);
};
const clienteSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  nome: z.string().trim().min(2).max(150), telefone: texto(20),
  cpf_cnpj: texto(18).refine(documentoValido, 'CPF ou CNPJ inválido.'), endereco: texto(255),
  numero: texto(20), complemento: texto(120), bairro: texto(120),
  cep: texto(9), cidade: texto(100), estado: texto(2),
  quantidade_aparelhos: z.coerce.number().int().min(0).max(200).optional().default(0),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
}).passthrough();
const equipamentoSchema = z.object({
  cliente_id: z.coerce.number().int().positive(), marca: texto(100), modelo: texto(100),
  capacidade: texto(50), numero_serie: texto(100), patrimonio: texto(100), tipo_gas: texto(50),
  ambiente: texto(120), instalado_em: data, garantia_ate: data, proxima_manutencao: data,
  observacoes: texto(2000),
}).passthrough();
function validar(schema) { return (req,res,next) => { const r=schema.safeParse(req.body); if(!r.success) return res.status(400).json({erro:'Dados inválidos.',detalhes:r.error.issues}); req.body=r.data; next(); }; }
module.exports = { validarCliente: validar(clienteSchema), validarEquipamento: validar(equipamentoSchema) };
