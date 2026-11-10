# Recepção de clientes pelo WhatsApp

Implementação local de 09/11/2026. Não foi publicada nem conectada a contatos reais nesta validação.

## Jornada do cliente

O primeiro contato recebe a identificação da empresa e um menu com limpeza/manutenção, instalação/remoção, equipamento com problema, orçamento e financeiro/outros. Pedidos em texto como “meu ar não gela” podem iniciar diretamente a identificação do serviço.

O fluxo pergunta nome, cidade/bairro e uma descrição breve. Financeiro/outros dispensa a localização. Não solicita CPF, senha, dados bancários ou endereço completo. Nome já cadastrado não é revelado pelo robô. A triagem fica na conversa; não cria cliente, OS, cobrança ou reserva de agenda automaticamente.

`0` ou `atendente` encaminha para uma pessoa em qualquer etapa. `menu` reinicia a coleta. Duas respostas inválidas encaminham para a espera, evitando loops. Áudio e outras mídias também seguem para a equipe; o sistema registra o tipo, sem baixar, transcrever ou disponibilizar o anexo nesta entrega. A equipe deve consultar a mídia pelo canal apropriado.

Ao terminar, o cliente recebe confirmação do encaminhamento e a informação de que valores e agendamento dependem da equipe. O horário configurado é informativo: não calcula expediente, feriados ou prazo de resposta.

## Painel web

Em **Atendimento → Configurar automação**, gestores com `GESTAO_GERENCIAR` e `ATENDIMENTO_RESPONDER` podem editar o nome, boas-vindas, horário, encaminhamento e ativação. A configuração pertence à empresa da sessão. Desativar leva as conversas em automação para a espera, sem alterar atendimentos humanos. Reativar não recupera automaticamente conversas que já estão na espera.

O simulador usa os textos em edição, mesmo antes de salvar. Não grava conversas nem chama a Meta. Alterar um texto reinicia a simulação.

Nas conversas há resumo da triagem, busca por contato/serviço e rascunhos separados por contato em memória. O histórico apresenta as últimas 500 mensagens em ordem cronológica; não há navegação para mensagens anteriores nesta entrega. Atualizações usam os avisos SSE existentes e a consulta de contingência.

Assumir interrompe o robô e prepara uma apresentação como rascunho. **Não envia uma saudação automaticamente.** O operador revisa e clica em Enviar. Respostas rápidas também apenas preenchem o rascunho. Encerrar é uma ação interna, sem despedida automática; é possível preparar/enviar a despedida antes de encerrar.

Para enviar, é necessário ter `ATENDIMENTO_RESPONDER`, assumir a conversa e estar dentro da janela de 24 horas. Outro operador não pode assumir, mover ou encerrar uma conversa já atribuída. Retomar automação limpa a triagem e inicia a nova recepção na próxima mensagem do cliente. A janela é renovada por mensagem recebida, não por uma resposta do atendente.

## Persistência e entrega

- Patch `013_whatsapp_recepcao.sql`: configuração por empresa, triagem/versão na conversa e fila `whatsapp_respostas_bot`.
- O webhook exige `WHATSAPP_APP_SECRET` e assinatura HMAC válida. Sem segredo retorna 503; assinatura inválida retorna 401. Só confirma 200 depois de persistir a entrada e a resposta pendente. Falha de persistência retorna 503 para permitir reentrega pela Meta.
- A deduplicação ocorre antes dos contadores e da transição de etapa. Reentregar o mesmo `whatsapp_id` não aumenta não lidas nem gera outra resposta. Transações serializam a recepção por empresa/telefone.
- `WhatsAppBotWorker`, iniciado por `server.js`, consome as respostas persistentes a cada dois segundos. Processa uma por vez por processo e preserva a ordem de cada conversa. Usa a conta da empresa e confere versão, atendente, encerramento e janela antes de enviar.
- Assumir, mover, encerrar e desativar invalidam respostas antigas pela versão da conversa. Uma mensagem que já começou a ser enviada pode terminar antes da ação humana adquirir o bloqueio.
- Erro/timeout de envio cancela a tarefa e leva a conversa para espera com aviso no painel. Não repete automaticamente um envio ambíguo, pois a Meta pode tê-lo aceitado. Conferir o canal antes de responder novamente.
- Não há garantia de envio exatamente uma vez: queda do processo após aceite da Meta e antes do commit pode deixar tarefa pendente e causar reenvio na retomada. Não foi implementada conciliação remota desse caso.

Logs de falha do envio de texto não incluem o corpo da conversa, telefone ou token. Triagem e respostas persistentes contêm dados pessoais e devem integrar o inventário, a política de retenção e as rotinas autorizadas de atendimento aos titulares. Não há novo expurgo automático desses dados.

## API

| Método/rota | Acesso e efeito |
|---|---|
| `GET /atendimento/whatsapp/automacao` | `ATENDIMENTO_VISUALIZAR`; configuração da própria empresa, sem credenciais |
| `PUT /atendimento/whatsapp/automacao` | `ATENDIMENTO_RESPONDER` + `GESTAO_GERENCIAR`; validação estrita dos campos e limites |
| `POST /atendimento/whatsapp/automacao/simular` | `ATENDIMENTO_VISUALIZAR` + `GESTAO_GERENCIAR`; prévia sem envio ou escrita |
| `POST /atendimento/whatsapp/conversas/:id/assumir` | Atribui ao operador; não envia mensagem |
| `POST /atendimento/whatsapp/conversas/:id/mensagens` | Exige atribuição e janela aberta; texto até 4000 caracteres, mais identificação do atendente |
| `PATCH /atendimento/whatsapp/conversas/:id/fila` | Somente `ESPERA` ou `AUTOMACAO`; para `ATENDENDO`, usar assumir |
| `POST /atendimento/whatsapp/conversas/:id/encerrar` | Somente operador responsável; não envia mensagem |

O simulador recebe `{ config, texto, estado: { etapa, dados, tentativas } }`. A resposta contém `texto`, `proximaEtapa`, `dados`, `tentativas`, `fila` e `ativo`. Use `proximaEtapa` como `estado.etapa` na próxima chamada. Os dados de triagem permitidos são `servico`, `nome`, `localidade` e `descricao`.

## Ativação e limites

1. Fazer backup e aplicar `npm run migrate` no ambiente de destino antes de iniciar a API atualizada.
2. Conferir a associação do número à empresa, a referência do token, `WHATSAPP_APP_SECRET` e a assinatura do webhook. Não expor credenciais no painel ou nos documentos.
3. Configurar os textos pelo painel e testar o simulador.
4. Iniciar a API pelo entrypoint `server.js` para ativar o worker. Importar `src/app.js` sozinho não processa a fila.
5. Homologar com número de teste autorizado da Meta: recepção, humano, reentrega, falha de envio e janela expirada. Essa homologação externa permanece pendente.

O limite de 24 horas e o caminho claro para atendimento humano seguem a [política oficial do WhatsApp Business](https://whatsappbusiness.com/policy/). A central não ganhou envio de templates fora da janela nesta entrega. Confirmar as condições atuais da conta antes da operação.

## Validação local

Testes usam dados sintéticos, transporte simulado e PostgreSQL temporário separado do banco do projeto. Incluem duplicação concorrente, fluxo completo, configuração por empresa, cancelamento após assumir, janela vencida, HMAC, permissões, entrada inválida e tratamento de falha do worker. Os cenários de navegador cobrem configuração/simulação, passagem humana, rascunhos, leitura sem resposta, layout de celular e resposta atrasada de outro contato.

Resultados finais: **134 testes Node aprovados, sem skips**, com PostgreSQL real temporário; **15 cenários de navegador aprovados** (12 web, incluindo quatro do WhatsApp, e três do ambiente de componentes mobile); build web de produção aprovado; `git diff --check` sem erros. O teste de celular detectou uma lista sem altura útil, corrigida e validada novamente. Capturas locais em `tmp/whatsapp-central.png` e `tmp/whatsapp-mobile-web.png`. Os clusters de testes foram encerrados. Os componentes mobile em navegador não equivalem à homologação nativa.

Para reproduzir em banco exclusivo de testes: definir `TEST_DATABASE_URL` e executar `npm test` e `npm run test:e2e`. Não usar o banco de produção. Nenhum APK foi gerado; o aplicativo nativo não recebeu alterações neste lote.
