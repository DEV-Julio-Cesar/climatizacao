const { z } = require('zod');

const tiposServico = ['LIMPEZA', 'INSTALACAO', 'REMOCAO', 'PREVENTIVA', 'PROBLEMA_TECNICO'];
const statusOs = ['ABERTA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA'];

const criarOsSchema = z.object({
  cliente_id: z.coerce.number().int().positive(),
  aparelho_id: z.coerce.number().int().positive().nullable().optional(),
  tecnico_id: z.coerce.number().int().positive().optional(),
  tipo_servico: z.enum(tiposServico),
  descricao_problema: z.string().trim().min(5).max(1000),
  valor_total: z.coerce.number().nonnegative().optional(),
  agendado_para: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

const statusSchema = z.object({
  novo_status: z.enum(statusOs),
}).strict();

const reagendarSchema = z.object({
  tecnico_id: z.coerce.number().int().positive(),
  agendado_para: z.string().datetime({ offset: true }),
}).strict();

const numeroOpcional = z.union([z.coerce.number(), z.literal('').transform(() => undefined)]).optional();
const execucaoSchema = z.object({
  diagnostico: z.string().trim().min(5).max(3000),
  solucao_aplicada: z.string().trim().min(5).max(3000),
  recomendacoes: z.string().trim().max(2000).optional().default(''),
  garantia_dias: z.coerce.number().int().min(0).max(3650).default(0),
  retorno_necessario: z.boolean().default(false),
  checklist: z.array(z.object({
    item: z.string().trim().min(2).max(150),
    conforme: z.boolean(),
    observacao: z.string().trim().max(500).optional().default(''),
  }).strict()).min(1).max(50),
  medicoes: z.object({
    temperatura_retorno: numeroOpcional,
    temperatura_insuflamento: numeroOpcional,
    tensao: numeroOpcional,
    corrente: numeroOpcional,
    pressao_baixa: numeroOpcional,
    pressao_alta: numeroOpcional,
    umidade: numeroOpcional,
    tipo_gas: z.string().trim().max(50).optional().default(''),
  }).strict(),
  itens: z.array(z.object({
    tipo: z.enum(['PECA', 'SERVICO']),
    referencia_id: z.coerce.number().int().positive().nullable().optional(),
    descricao: z.string().trim().min(2).max(200),
    quantidade: z.coerce.number().positive().max(99999),
    valor_unitario: z.coerce.number().nonnegative().max(9999999),
  }).strict()).max(100).default([]),
}).strict();

function validar(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      return res.status(400).json({
        erro: 'Falha na validação de entrada.',
        detalhes: resultado.error.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensagem: issue.message,
        })),
      });
    }
    req.body = resultado.data;
    return next();
  };
}

module.exports = {
  validarCriacaoOs: validar(criarOsSchema),
  validarStatusOs: validar(statusSchema),
  validarReagendamento: validar(reagendarSchema),
  validarExecucaoOs: validar(execucaoSchema),
  tiposServico,
  statusOs,
};
