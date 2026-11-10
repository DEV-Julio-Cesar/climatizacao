const SERVICOS = { LIMPEZA: 'Limpeza / manutenção preventiva', INSTALACAO: 'Instalação / remoção', REPARO: 'Equipamento com problema', ORCAMENTO: 'Orçamento', OUTRO: 'Financeiro / outro assunto' };
const PADRAO = { ativo: true, nome_atendimento: 'nossa equipe', boas_vindas: 'Vamos entender o que você precisa para encaminhar seu atendimento.', horario_informativo: '', encaminhamento: 'Nossa equipe dará continuidade ao seu atendimento por aqui.' };
const normalizar = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const opcoes = '1 - Limpeza / manutenção preventiva\n2 - Instalação / remoção\n3 - Equipamento com problema\n4 - Orçamento\n5 - Financeiro / outro assunto\n0 - Falar com atendente';
function menu(config = {}) { const c = { ...PADRAO, ...config }; return `Olá! 👋 Você está falando com ${c.nome_atendimento || 'nossa equipe'}.\n\n${c.boas_vindas}\n\nComo podemos ajudar?\n${opcoes}\n\nVocê pode digitar menu para recomeçar ou 0 para falar com a equipe.`; }
function servico(texto) {
  const t = normalizar(texto), numero = { '1':'LIMPEZA','2':'INSTALACAO','3':'REPARO','4':'ORCAMENTO','5':'OUTRO' };
  if (numero[t]) return numero[t];
  if (/\b(limpeza|higienizacao|preventiva)\b/.test(t)) return 'LIMPEZA';
  if (/\b(instalacao|instalar|remocao|remover)\b/.test(t)) return 'INSTALACAO';
  if (/\b(conserto|reparo|defeito|problema)\b|nao (gela|liga|esfria)|pingando|vazamento/.test(t)) return 'REPARO';
  if (/\b(orcamento|cotacao|preco)\b/.test(t)) return 'ORCAMENTO';
  if (/\b(financeiro|pagamento|boleto|outro)\b/.test(t)) return 'OUTRO';
  return null;
}

function decidir(etapa, texto, _clienteNome, contexto = {}) {
  const config = { ...PADRAO, ...contexto.config }, dados = { ...(contexto.dados || {}) };
  const entrada = normalizar(texto), original = String(texto || '').trim();
  const resposta = (mensagem, proximaEtapa, extras = {}) => ({ texto: mensagem, proximaEtapa, dados, tentativas: 0, fila: 'AUTOMACAO', ativo: true, ...extras });
  const encaminhar = mensagem => resposta([mensagem || 'Certo! Vamos continuar com um atendente.', config.encaminhamento, config.horario_informativo].filter(Boolean).join('\n\n'), 'AGUARDANDO_ATENDENTE', { fila:'ESPERA',ativo:false });
  const invalido = pergunta => {
    const tentativas = Math.min(2, Number(contexto.tentativas || 0) + 1);
    return tentativas >= 2 ? encaminhar('Vou encaminhar sua mensagem para uma pessoa da nossa equipe.') : resposta(`${pergunta}\n\nSe preferir, digite 0 para falar com um atendente.`, etapa || 'AGUARDANDO_SERVICO', { tentativas });
  };
  if (!config.ativo) return resposta(null, 'AGUARDANDO_ATENDENTE', { fila:'ESPERA',ativo:false });
  if (['0','atendente','humano','falar com atendente','falar com humano'].includes(entrada)) return encaminhar();
  if (contexto.tipo && contexto.tipo !== 'text' && contexto.tipo !== 'interactive' && contexto.tipo !== 'button') return encaminhar('Recebemos seu arquivo. Um atendente poderá avaliar o conteúdo e continuar a conversa.');
  if (['menu','reiniciar','inicio','voltar'].includes(entrada)) return { ...resposta(menu(config), 'AGUARDANDO_SERVICO'), dados:{} };
  if (etapa === 'AGUARDANDO_TIPO') return resposta(`Vamos continuar seu atendimento. Qual serviço você precisa?\n\n${opcoes}`, 'AGUARDANDO_SERVICO');
  if (['ATENDIMENTO_CLIENTE','NOVO_CONTATO','AGUARDANDO_ATENDENTE'].includes(etapa)) return encaminhar();
  if (!etapa || etapa === 'INICIO') {
    const identificado = servico(original);
    if (identificado && !/^\d+$/.test(entrada)) {
      dados.servico = identificado;
      return resposta(`Olá! Você está falando com ${config.nome_atendimento || 'nossa equipe'}.\n\nEntendi que você precisa de ${SERVICOS[identificado].toLowerCase()}. Como podemos chamar você?\n\nDigite 0 se preferir um atendente.`, 'AGUARDANDO_NOME');
    }
    return resposta(menu(config), 'AGUARDANDO_SERVICO');
  }
  if (etapa === 'AGUARDANDO_SERVICO') {
    const escolhido = servico(original);
    if (!escolhido) return invalido(`Escolha o serviço para continuarmos:\n${opcoes}`);
    dados.servico = escolhido;
    return resposta('Como podemos chamar você? Informe somente seu nome, sem documentos ou senhas.', 'AGUARDANDO_NOME');
  }
  if (etapa === 'AGUARDANDO_NOME') {
    const nome = original.replace(/\s+/g,' ');
    if (nome.length < 2 || nome.length > 80 || !/^[\p{L}\p{M} .'’-]+$/u.test(nome)) return invalido('Informe o nome pelo qual você gostaria de ser chamado. Não é necessário enviar documento.');
    dados.nome = nome;
    return dados.servico === 'OUTRO'
      ? resposta('Conte brevemente como podemos ajudar. Não envie senhas ou dados bancários.', 'AGUARDANDO_DESCRICAO')
      : resposta(`Obrigado, ${nome}! Em qual cidade e bairro seria o atendimento? Ainda não precisamos do endereço completo.`, 'AGUARDANDO_LOCALIDADE');
  }
  if (etapa === 'AGUARDANDO_LOCALIDADE') {
    if (original.length < 3 || original.length > 150 || /[\x00-\x1f]/.test(original)) return invalido('Informe a cidade e o bairro em até 150 caracteres.');
    dados.localidade = original;
    return resposta('Conte brevemente o que precisa: serviço, quantidade de aparelhos ou problema apresentado. O agendamento e os valores serão confirmados pela equipe.', 'AGUARDANDO_DESCRICAO');
  }
  if (etapa === 'AGUARDANDO_DESCRICAO') {
    if (original.length < 5 || original.length > 1000) return invalido('Descreva o pedido com 5 a 1000 caracteres, sem documentos ou senhas.');
    dados.descricao = original;
    return encaminhar(`Obrigado${dados.nome ? `, ${dados.nome}` : ''}! Seu pedido foi encaminhado para análise.\n\nServiço: ${SERVICOS[dados.servico] || 'Atendimento'}${dados.localidade ? `\nLocalidade: ${dados.localidade}` : ''}\n\nO agendamento e os valores serão confirmados por um atendente.`);
  }
  return { ...resposta(menu(config), 'AGUARDANDO_SERVICO'), dados:{} };
}
module.exports = { decidir, menu, MENU:menu(), PADRAO, SERVICOS };
