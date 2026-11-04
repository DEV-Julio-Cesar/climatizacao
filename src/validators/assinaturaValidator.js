const { z } = require('zod');
const nomeAssinanteSchema = z.string().trim().transform(nome => nome.replace(/\s+/g,' '))
  .pipe(z.string().min(3).max(150).regex(/^[^\x00-\x1f\x7f]+$/));
module.exports = { nomeAssinanteSchema };
