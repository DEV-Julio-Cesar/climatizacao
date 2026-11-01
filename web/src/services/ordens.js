import { api } from './api';

// Percorre o cursor sem voltar a fazer uma consulta ilimitada no banco.
export async function listarOrdens(filtros = {}) {
  const itens = [];
  let cursor = null;
  do {
    const { data } = await api.get('/os/todas', {
      params: { ...filtros, limit: 100, ...(cursor ? { cursor } : {}) },
    });
    itens.push(...data.items);
    cursor = data.next_cursor;
  } while (cursor);
  return itens;
}
