import { api, getAccessToken, restaurarSessao } from './api';

export function conectarEventos(onEvent) {
  const controller = new AbortController();
  let timer;
  let ativo = true;

  const conectar = async () => {
    try {
      const token = getAccessToken();
      if (!token || !ativo) return;
      const response = await fetch(`${api.defaults.baseURL}/eventos/stream`, {
        headers:{ Authorization:`Bearer ${token}`, Accept:'text/event-stream' },
        signal:controller.signal,
      });
      if (response.status === 401) {
        await restaurarSessao();
        throw new Error('Sessão renovada; reconectando stream');
      }
      if (!response.ok || !response.body) throw new Error('Stream indisponível');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (ativo) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream:true });
        const blocos = buffer.split('\n\n');
        buffer = blocos.pop() || '';
        for (const bloco of blocos) {
          if (bloco.startsWith(':')) continue;
          const tipo = bloco.match(/^event:\s*(.+)$/m)?.[1];
          const texto = bloco.match(/^data:\s*(.+)$/m)?.[1];
          if (tipo && tipo !== 'conectado') onEvent(tipo, texto ? JSON.parse(texto) : {});
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError' && ativo) timer = setTimeout(conectar, 5000);
    }
  };
  conectar();
  return () => { ativo=false; clearTimeout(timer); controller.abort(); };
}
