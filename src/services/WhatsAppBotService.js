const MENU = `Olá! 👋 Bem-vindo ao atendimento da ClimaSaaS.\n\nDigite uma opção:\n\n1 - Já sou cliente\n2 - Ainda não sou cliente`;

function decidir(etapa, texto, clienteNome) {
  const entrada = String(texto || '').trim().toLowerCase();
  if (!etapa || etapa === 'INICIO') return { texto: MENU, proximaEtapa: 'AGUARDANDO_TIPO' };
  if (etapa === 'AGUARDANDO_TIPO') {
    if (entrada === '1' || entrada === 'cliente' || entrada === 'sou cliente') {
      if (clienteNome) return { texto: `Olá, ${clienteNome}! Localizamos seu cadastro. Por favor, descreva como podemos ajudar. Um atendente continuará o atendimento por aqui.`, proximaEtapa: 'ATENDIMENTO_CLIENTE' };
      return { texto: 'Não localizamos um cliente com este número. Se estiver falando por outro telefone, informe seu nome e o telefone cadastrado. Caso seja um novo contato, digite 2.', proximaEtapa: 'AGUARDANDO_TIPO' };
    }
    if (entrada === '2' || entrada === 'não sou cliente' || entrada === 'nao sou cliente') return { texto: 'Que bom falar com você! Informe seu nome e conte brevemente qual serviço ou equipamento precisa de atendimento. Nossa equipe responderá em seguida.', proximaEtapa: 'NOVO_CONTATO' };
    return { texto: `Não entendi a opção.\n\n1 - Já sou cliente\n2 - Ainda não sou cliente`, proximaEtapa: 'AGUARDANDO_TIPO' };
  }
  return null;
}

module.exports = { decidir, MENU };
