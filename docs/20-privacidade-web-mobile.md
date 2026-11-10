# Privacidade na web e no mobile — 09/11/2026

Continuação das entregas [18 — LGPD](./18-lgpd-protecao-dados.md) e [19 — proteção offline](./19-homologacao-protecao-offline.md). Este lote não gera APK nem publica serviços.

Entrega posterior: [homologação de interface](./21-homologacao-interface.md), com testes de navegador, correção de consulta obsoleta e atualização de dependências. Os limites de validação abaixo registram a entrega inicial.

## Aplicativo

`Perfil → Meus dados e solicitações de privacidade` abre telas nativas com tema claro/escuro, formulário com tratamento do teclado, atualização manual, filtro por situação e lista paginada. Usuários podem registrar pedido de acesso, correção, avaliação de exclusão, informação ou oposição e acompanhar respostas e histórico.

Gestores/admin com gerenciamento de gestão podem analisar solicitações da empresa. Registrar/consultar pedido vinculado a cliente exige também gerenciamento de clientes. A tela oferece início de análise, registro de novo andamento e conclusão com resposta. Compartilhar protocolo abre a folha de compartilhamento do aparelho somente com o número e orientação de acompanhamento; não envia dados pessoais ou respostas automaticamente.

O aviso de privacidade do Perfil agora usa a URL da API configurada, em vez de um endereço Render fixo. Registrar pedido exige conexão. Não existe enfileiramento offline nem salvamento de descrições de privacidade no SQLite; uma falha mantém o formulário em memória enquanto a tela permanece aberta. O novo fluxo é de solicitação/análise, sem apagar dados da conta ou do servidor automaticamente.

## Painel web

Em `Minha conta → Privacidade`, a listagem aceita filtros por situação, tipo e protocolo completo. A mudança de filtro reinicia a página e respostas antigas não substituem uma leitura mais recente. O usuário pode abrir o histórico de cada protocolo e carregar mais andamentos. A autorização permanece no servidor, tanto para a listagem quanto para o detalhe/histórico.

Campos de pedido de cliente aparecem conforme a permissão retornada pela API. O formulário mantém a identificação de um envio que falhou e bloqueia submissões simultâneas na mesma tela. A área recebe estilos para filtros, campos e linha do histórico. As funções anteriores de resumo pessoal e desativação permanecem disponíveis no painel.

## API e banco

- `GET /privacidade/solicitacoes`: mantém `pagina`, adicionando filtros opcionais `status`, `tipo` e `protocolo` (UUID completo). Lista até 50 itens e indica `tem_mais`. Filtros inválidos retornam 400. Nenhum filtro substitui a empresa/solicitante/permissões da sessão.
- A listagem também informa `pode_registrar_cliente`, para a interface não oferecer registro em nome de clientes a gestores sem essa autorização.
- `GET /privacidade/solicitacoes/:id?cursor=0`: retorna solicitação, capacidade de gerenciamento e até 50 andamentos em ordem crescente de ID. `paginacao.proximo_cursor` permite continuar. Não informa nome/ID do usuário que fez a análise. Protocolo inexistente ou fora do escopo autorizado retorna 404; possuir o UUID não autoriza leitura.
- `POST /privacidade/solicitacoes`: aceita `Idempotency-Key` opcional, no formato UUID. Com a mesma conta/empresa/chave e conteúdo normalizado igual, retorna o protocolo já existente com 200 e `ja_registrada: true`; não cria novo histórico nem consome novamente o limite de criação. Mesmo identificador com dados diferentes retorna 409. Novo pedido retorna 201. Clientes antigos sem chave continuam funcionando sem proteção de reenvio.
- `PATCH /privacidade/solicitacoes/:id`: preserva fluxo recebido/em análise/concluído e resposta obrigatória. Registrar outro andamento em análise preserva respostas anteriores no histórico. Uma solicitação concluída não pode ser reaberta por esse endpoint.
- `012_privacidade_acompanhamento.sql`: adiciona `client_uuid` com índice único por empresa/solicitante e índices de situação e histórico. O lock do usuário serializa a checagem de reenvio com a criação entre instâncias da API. Criação e primeiro andamento permanecem na mesma transação.

## Limites

A chave de reenvio é mantida em memória pelo formulário. Fechar/recarregar a tela ou iniciar um pedido diferente pode gerar outra chave. Após resposta perdida, consultar os protocolos antes de iniciar outro pedido. A proteção cobre a criação com chave, não promete deduplicação de todas as atualizações de resposta.

Não há consulta pública por protocolo, envio automático de e-mail, alerta de prazo legal, coleta de documentos de identidade, purga por retenção ou exclusão automática de registros. A identificação proporcional do titular e o acompanhamento dos prazos aplicáveis continuam sob responsabilidade da empresa. O histórico não expõe nomes de analistas, mas o banco mantém autoria para auditoria autorizada.

## Implantação e homologação

1. Aplicar `npm run migrate` no ambiente apropriado antes de publicar a API: o lote depende do patch 012, além dos anteriores. Nenhuma migração foi aplicada ao banco operacional nesta entrega.
2. Publicar primeiro a API atualizada; os novos filtros e detalhe não funcionam na API anterior. Compilar/publicar o painel e incluir as telas no futuro APK 1.1.0, ainda não gerado.
3. Homologar usuário técnico, gestor completo, gestor sem acesso de clientes e outra empresa: verificar lista, detalhe, histórico e resposta; pedir protocolo de outro usuário deve respeitar o escopo de acesso.
4. Testar erro de rede após envio, repetição do mesmo formulário, mudança de filtros, teclado e tema no aparelho; testar histórico com mais de 50 entradas e confirmar que conclusão não elimina dados.
5. Validar no navegador com o domínio/cookies publicados e em aparelho antes de distribuir. Não foi executado teste visual ou E2E nesta entrega.

## Validação executada

**123 testes passaram com PostgreSQL real; zero falhas e zero testes ignorados.** O cluster de testes temporário usou senha aleatória, loopback e dados sintéticos e foi encerrado ao concluir, sem usar o banco operacional.

Os testes novos verificam filtros inválidos, manutenção do escopo da empresa, rejeição de chave inválida, reenvio idêntico, conflito de conteúdo, autorização do detalhe, paginação do histórico e ausência de nomes de analistas. No PostgreSQL real foram verificados reaplicação do patch, dois pedidos concorrentes retornando um único protocolo, filtro de tipo/status, rejeição de conteúdo diferente e bloqueio do detalhe para outra empresa.

Build de produção web e exportação web do mobile aprovados; sintaxe do controller e `git diff --check` verificados. O primeiro build web recebeu bloqueio de subprocesso do sandbox; a execução autorizada passou. Esses checks não equivalem a teste de interação visual, Keystore/Keychain ou operação em dispositivo.
