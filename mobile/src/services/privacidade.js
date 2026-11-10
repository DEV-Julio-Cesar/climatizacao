import { api } from './api';

export const tiposPrivacidade = {
  ACESSO: 'Acesso aos dados', CORRECAO: 'Correção', EXCLUSAO: 'Avaliação de exclusão',
  INFORMACAO: 'Informações sobre tratamento', OPOSICAO: 'Oposição ao tratamento',
};
export const statusPrivacidade = { RECEBIDA: 'Recebida', EM_ANALISE: 'Em análise', CONCLUIDA: 'Concluída' };
export function listarSolicitacoes(filtros = {}) {
  const query = Object.entries(filtros).filter(([, valor]) => valor !== '' && valor !== undefined)
    .map(([chave, valor]) => `${encodeURIComponent(chave)}=${encodeURIComponent(valor)}`).join('&');
  return api.chamadaAutenticada(`/privacidade/solicitacoes${query ? `?${query}` : ''}`);
}
export function criarSolicitacao(payload, chave) {
  return api.chamadaAutenticada('/privacidade/solicitacoes', 'POST', payload, 0, chave);
}
export function detalhesSolicitacao(protocolo, cursor = 0) {
  return api.chamadaAutenticada(`/privacidade/solicitacoes/${encodeURIComponent(protocolo)}?cursor=${encodeURIComponent(cursor)}`);
}
export function responderSolicitacao(protocolo, status, resposta) {
  return api.chamadaAutenticada(`/privacidade/solicitacoes/${encodeURIComponent(protocolo)}`, 'PATCH', { status, resposta });
}
