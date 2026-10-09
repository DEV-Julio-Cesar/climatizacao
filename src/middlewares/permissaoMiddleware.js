const padroes = {
  TECNICO: ['AGENDA_VISUALIZAR', 'OS_CRIAR', 'OS_EXECUTAR', 'CLIENTES_VISUALIZAR', 'CLIENTES_GERENCIAR', 'ESTOQUE_VISUALIZAR'],
  GESTOR: ['AGENDA_VISUALIZAR', 'OS_CRIAR', 'OS_EXECUTAR', 'OS_REAGENDAR', 'CLIENTES_VISUALIZAR',
    'CLIENTES_GERENCIAR', 'ESTOQUE_VISUALIZAR', 'ESTOQUE_GERENCIAR', 'FINANCEIRO_VISUALIZAR',
    'FINANCEIRO_GERENCIAR', 'GESTAO_VISUALIZAR', 'GESTAO_GERENCIAR'],
  ADMIN: ['*'],
};

function permissoesEfetivas(usuario) {
  if (Array.isArray(usuario?.permissoes)) return usuario.permissoes;
  return padroes[usuario?.perfil] || [];
}

module.exports = (permissao) => (req, res, next) => {
  const permissoes = permissoesEfetivas(req.usuarioLogado);
  if (!permissoes.includes('*') && !permissoes.includes(permissao)) {
    return res.status(403).json({ erro: `Permissão necessária: ${permissao}.` });
  }
  return next();
};

module.exports.padroes = padroes;
module.exports.permissoesEfetivas = permissoesEfetivas;
