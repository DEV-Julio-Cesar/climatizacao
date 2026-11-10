# Homologação de interface — 09/11/2026

Continuação do [lote 20](./20-privacidade-web-mobile.md). Foram adicionados testes com navegador real, um ambiente exclusivo para componentes mobile e verificações de segurança das dependências. Não houve geração de APK, publicação ou acesso ao banco operacional.

## Correções encontradas na homologação

- Ao trocar filtros rapidamente na web, uma consulta antiga que falhasse podia substituir a mensagem do resultado atual. Agora erros e resultados obsoletos são ignorados; existe um cenário de navegador que reproduz a falha e verifica a correção.
- O recarregamento após criar/responder usa os filtros atuais, mesmo quando o usuário altera a seleção durante uma chamada. O texto da resposta gerencial é limpo após confirmação, evitando reutilização acidental.
- Os campos de troca de senha receberam associação explícita entre rótulo e input. Os testes localizam os campos pelos nomes acessíveis.
- Botões secundários da conta receberam aparência consistente e foco visível. As ações primárias/chips da tela mobile usam fundo mais escuro para melhorar o contraste do texto branco, inclusive no tema escuro.

## Testes de navegador

`npm run test:e2e` compila o painel e o ambiente de componentes mobile e executa Playwright. São onze cenários, com API e PostgreSQL reais em dados sintéticos:

1. Login, restauração da sessão pelo cookie, rótulos de senha e download do resumo sem persistir credenciais no localStorage.
2. Resposta perdida após criação: repetir o formulário web reutiliza a chave e recupera o protocolo confirmado pelo servidor.
3. Gestor inicia análise, consulta histórico e conclui com resposta.
4. Gestor sem permissão de clientes não vê o campo nem acessa um protocolo vinculado a cliente.
5. Histórico com 55 entradas: paginação, falha transitória e nova tentativa sem duplicar andamentos.
6. Troca de filtros com erro tardio da consulta antiga.
7. Layout web em viewport de 390 pixels sem rolagem horizontal; captura visual de teste.
8. Desativação: senha incorreta é rejeitada; senha correta desativa somente a conta sintética e retorna ao login.
9. Componente mobile registra pedido e abre resposta/histórico.
10. Componente mobile preserva formulário/chave depois de resposta perdida.
11. Componente mobile respeita permissão de clientes e renderiza tema escuro em viewport estreito; captura visual de teste.

No Windows desta sessão, o navegador foi o Edge instalado, em modo headless e perfil descartável, sem acessar cookies/perfis reais do usuário. A execução local passou com **11 testes de interface aprovados**. A suíte de API/domínio/offline passou com **126 testes aprovados, zero falhas e zero testes ignorados**, usando PostgreSQL 17 temporário. A exportação Expo do mobile passou. Capturas foram inspecionadas; não houve teste manual em aparelho.

## O que o teste mobile representa

`web/e2e-mobile/` importa os próprios componentes `Privacidade`/`DetalhePrivacidade` e o serviço `mobile/src/services/privacidade.js`. React Native Web renderiza os controles. Um adapter de API usa autenticação contra a API de teste; foco de navegação, alertas e tema são adaptados para o navegador. A chave de reenvio é enviada pelo serviço real do mobile.

Esse ambiente não testa Expo Go, binário Android/iOS, SecureStore/Keystore/Keychain, AES nativo, arquivos, push, câmera, teclado físico/virtual ou comportamento real da navegação. Ele não substitui o [checklist de aparelho](./19-homologacao-protecao-offline.md). Sem aparelho conectado, a homologação nativa permanece pendente.

O ambiente é compilado em `web/e2e-mobile-dist/`, ignorado pelo Git. Ele é servido exclusivamente pelo servidor de fixtures em `scripts/e2e-server.cjs`; a API de produção não contém essa rota. Não publicar esse diretório como parte do produto.

## Isolamento e execução

`scripts/e2e-server.cjs` exige `TEST_DATABASE_URL`, cria um schema com nome aleatório, aplica migrações e insere apenas contas/clientes/protocolos fictícios. Não carrega `.env`, não usa `DATABASE_URL` como alternativa e não inicia workers de e-mail, WhatsApp, alertas ou documentos. O navegador e o servidor de homologação ficam em `127.0.0.1`. Há testes que verificam a rejeição do fallback para o banco operacional e de uma URL de navegador externa.

O schema é removido no encerramento normal. Encerramento forçado pode deixar o schema de teste no banco dedicado; por isso não apontar `TEST_DATABASE_URL` para produção. O job CI usa um PostgreSQL descartável. Localmente, nesta sessão, o PostgreSQL também usou cluster temporário separado e senha aleatória, e foi encerrado após os testes.

Preparação para repetir em banco dedicado:

```powershell
npm ci
npm --prefix web ci
npm --prefix mobile ci
$env:TEST_DATABASE_URL='postgresql://USUARIO:SENHA@127.0.0.1:5432/climasaas_test'
npm run test:e2e
```

Requisitos: Node 22, PostgreSQL de testes e Edge instalado no Windows. No Linux/CI é utilizado Chromium do Playwright, instalado por `node web/node_modules/@playwright/test/cli.js install --with-deps chromium`. Não executar os comandos apontando para a base operacional.

Os resultados ficam em `tmp/e2e-results/`; falhas geram screenshot e trace. Os testes criam contas sintéticas e seus tokens são descartáveis, mas esses arquivos ainda devem ficar restritos à homologação. No CI, um job `interface` instala as três árvores de dependências e o Chromium e executa a suíte; diagnóstico de falha é guardado por três dias. O workflow foi configurado, mas não foi disparado remotamente nesta entrega.

## Dependências de segurança

- `follow-redirects` atualizado para 1.16.3 nos lockfiles da API e web; `body-parser` e `qs` receberam correções compatíveis na API.
- Zod migrado de 3 para **4.6.7**, após revisão da migração oficial. O parser ainda preserva os contratos usados pela aplicação nos testes, incluindo defaults/coerção, campos estritos, GPS obrigatório, datas e limites de coleção. UUIDs e formatos podem ser verificados mais estritamente na versão 4; consumidores devem enviar valores válidos.
- Auditoria final: **zero avisos nas dependências de produção da API** (`npm audit --omit=dev`) e **zero avisos na árvore web** (`npm --prefix web audit`). Isso é o resultado do registro npm consultado nesta sessão, não garantia de ausência de vulnerabilidades.
- A auditoria completa da API ainda aponta dois avisos moderados na cadeia de desenvolvimento `nodemon → minimatch`, excluída da imagem de produção. Não foi forçada uma versão principal incompatível dessa dependência transitiva. A árvore Expo/mobile não foi integralmente auditada neste lote.

Não houve nova migração SQL nesta entrega; permanecem os patches 011/012 necessários aos fluxos anteriores. Antes de publicar, instalar pelos lockfiles atualizados e homologar em aparelho/domínio real.

## Referências

- [Playwright — navegadores](https://playwright.dev/docs/browsers): Edge em modo de teste e Chromium no CI.
- [Zod — guia de migração para versão 4](https://zod.dev/v4/changelog): mudanças de formatos, inteiros, defaults e erros.
