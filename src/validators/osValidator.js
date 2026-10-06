const { z } = require('zod');

// 1. Definição do protocolo de validação rigoroso
const criarOsSchema = z.object({
  empresa_id: z.number().int().positive('O ID da empresa deve ser um número inteiro positivo.'),
  cliente_id: z.number().int().positive('O ID do cliente deve ser um número inteiro positivo.'),
  tecnico_id: z.number().int().positive('O ID do técnico deve ser um número inteiro positivo.'),
  
  // O enum reflete EXATAMENTE o tipo "tipo_servico_os" que criamos no PostgreSQL
  tipo_servico: z.enum(
    ['LIMPEZA', 'INSTALACAO', 'REMOCAO', 'PREVENTIVA', 'PROBLEMA_TECNICO'],
    { 
      errorMap: () => ({ message: 'Tipo de serviço não permitido pela arquitetura do sistema.' }) 
    }
  ),
  
  // Limites de tamanho previnem payloads massivos que travam o banco (DDoS no DB)
  descricao_problema: z.string()
    .trim() // Remove espaços em branco nas pontas
    .min(5, 'A descrição deve conter pelo menos 5 caracteres.')
    .max(1000, 'A descrição excedeu o limite máximo de 1000 caracteres.')
    .optional(), // Opcional, pois uma simples 'Limpeza' pode não ter problemas prévios
    
  valor_total: z.number().nonnegative('O valor não pode ser negativo.').optional()
}).strict(); // .strict() recusa a requisição se enviarem campos que não estão listados aqui

// 2. Middleware que intercepta a requisição antes do Controller
const validarEntradaOs = (req, res, next) => {
  try {
    // Tenta validar o corpo da requisição com as regras acima
    // Se passar, substitui o req.body pelos dados já limpos e formatados
    req.body = criarOsSchema.parse(req.body);
    
    // Libera a passagem para o OsController.js
    next(); 
    
  } catch (error) {
    // Se falhar, a requisição morre aqui e o banco de dados fica protegido
    return res.status(400).json({
      erro: 'Falha na validação de entrada.',
      detalhes: error.errors.map(err => ({
        campo: err.path.join('.'),
        mensagem: err.message
      }))
    });
  }
};

module.exports = validarEntradaOs;