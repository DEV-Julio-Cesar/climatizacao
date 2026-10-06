const { z } = require('zod');

const texto = (max) => z.string().trim().max(max).optional().default('');
const data = z.union([z.string().date(), z.literal('')]).optional().default('');
const clienteSchema = z.object({
  nome: z.string().trim().min(2).max(150), telefone: texto(20), endereco: texto(255),
  cep: texto(9), cidade: texto(100), estado: texto(2),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
}).strict();
const equipamentoSchema = z.object({
  cliente_id: z.coerce.number().int().positive(), marca: texto(100), modelo: texto(100),
  capacidade: texto(50), numero_serie: texto(100), patrimonio: texto(100), tipo_gas: texto(50),
  ambiente: texto(120), instalado_em: data, garantia_ate: data, proxima_manutencao: data,
  observacoes: texto(2000),
}).strict();
function validar(schema) { return (req,res,next) => { const r=schema.safeParse(req.body); if(!r.success) return res.status(400).json({erro:'Dados inválidos.',detalhes:r.error.issues}); req.body=r.data; next(); }; }
module.exports = { validarCliente: validar(clienteSchema), validarEquipamento: validar(equipamentoSchema) };
