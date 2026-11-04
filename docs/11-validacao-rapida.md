# Validação rápida

- `npm run validate`: valida os componentes afetados pelas alterações staged, unstaged e arquivos novos em relação ao HEAD. Alterações apenas em documentação não disparam builds.
- `npm run validate:plan`: exibe quais verificações serão executadas ou reaproveitadas.
- `npm run validate:full`: força a suíte completa e builds do painel/mobile, sem reaproveitar resultados.
- `npm test`: continua executando todos os testes, incluindo PostgreSQL quando `TEST_DATABASE_URL` está definida.

Uma alteração na API executa a suíte de testes; uma alteração no painel compila o painel; uma alteração no mobile exporta o app. Mudanças no armazenamento/sincronização mobile também executam testes offline. Arquivos compartilhados de dependências e do próprio validador invalidam os três componentes.

Resultados aprovados são armazenados em `tmp/validation-cache.json`, ignorado pelo Git. O cache usa conteúdo e nomes de todos os arquivos do componente, versão do Node, comando e variáveis de ambiente relevantes. Arquivos novos, exclusões e alterações de conteúdo invalidam o resultado. Falhas não são armazenadas como sucesso. Cada execução informa o tempo por componente e só detalha a saída dos comandos quando há falha.

Use validação completa após alterações em configurações locais ignoradas pelo Git (como `.env`), reinstalação de ferramentas ou antes de publicar. O comando rápido compara fontes com HEAD; não substitui revisão, teste em dispositivo ou homologação.

No CI, a API com PostgreSQL, o painel e o mobile executam em jobs independentes. Novo push na mesma referência cancela uma execução anterior ainda em andamento. Nenhum cache local dispensa testes no CI.
