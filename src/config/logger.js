/**
 * Logger estruturado — emite JSON por linha para facilitar ingestão
 * em serviços como Datadog, Logtail, Papertrail ou CloudWatch.
 *
 * Campos sensíveis são mascarados antes de qualquer saída para que
 * senhas, tokens e dados pessoais não apareçam em logs.
 */

// Campos cujos valores devem ser mascarados (case-insensitive)
const CAMPOS_SENSIVEIS = new Set([
  'senha', 'senha_hash', 'senha_atual', 'nova_senha', 'password',
  'token', 'refresh_token', 'access_token', 'authorization',
  'cpf', 'cpf_cnpj', 'telefone', 'email',
  'whatsapp_access_token', 'whatsapp_access_key',
  'credit_card', 'card_number', 'cvv',
]);

const MASCARA = '[REDACTED]';

/**
 * Mascara recursivamente os valores de campos sensíveis em objetos/arrays.
 * Não modifica o objeto original — retorna uma cópia rasa.
 */
function mascarar(valor, profundidade = 0) {
  if (profundidade > 8) return valor; // evita loops em estruturas circulares
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map((v) => mascarar(v, profundidade + 1));
  if (typeof valor === 'object') {
    const saida = {};
    for (const [chave, v] of Object.entries(valor)) {
      saida[chave] = CAMPOS_SENSIVEIS.has(chave.toLowerCase())
        ? MASCARA
        : mascarar(v, profundidade + 1);
    }
    return saida;
  }
  return valor;
}

/**
 * Serializa um objeto de log para JSON, mascarando campos sensíveis.
 * Erros (instâncias de Error) são convertidos para objeto simples.
 */
function serializar(campos) {
  try {
    return JSON.stringify(mascarar(campos));
  } catch {
    return JSON.stringify({ nivel: campos.nivel || 'info', mensagem: String(campos.mensagem || '') });
  }
}

const NIVEL = {
  erro:  50,
  aviso: 40,
  info:  30,
  debug: 20,
};

// Em produção, suprime debug; em dev/test mostra tudo
const NIVEL_MINIMO = process.env.LOG_LEVEL
  ? NIVEL[process.env.LOG_LEVEL] ?? NIVEL.info
  : (process.env.NODE_ENV === 'production' ? NIVEL.info : NIVEL.debug);

function emitir(nivel, mensagem, campos = {}) {
  if ((NIVEL[nivel] ?? 0) < NIVEL_MINIMO) return;

  // Converte Error para campos estruturados
  if (campos instanceof Error) {
    campos = { erro_mensagem: campos.message, erro_stack: campos.stack, erro_codigo: campos.code };
  }

  const linha = serializar({
    nivel,
    timestamp: new Date().toISOString(),
    mensagem,
    ...campos,
  });

  if (nivel === 'erro' || nivel === 'aviso') {
    process.stderr.write(linha + '\n');
  } else {
    process.stdout.write(linha + '\n');
  }
}

const logger = {
  info:  (mensagem, campos) => emitir('info',  mensagem, campos),
  debug: (mensagem, campos) => emitir('debug', mensagem, campos),
  aviso: (mensagem, campos) => emitir('aviso', mensagem, campos),
  erro:  (mensagem, campos) => emitir('erro',  mensagem, campos),
  mascarar, // exportado para uso em testes
};

module.exports = logger;
