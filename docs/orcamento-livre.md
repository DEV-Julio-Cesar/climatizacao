# Orçamento com destinatário livre e itens manuais

A proposta atual foi ampliada na web e no mobile, mantendo cliente e catálogo existentes.

## Uso

- Escolha um cliente cadastrado ou a opção Futuro cliente, sem cadastro. Para futuro cliente, somente nome é obrigatório; telefone, e-mail e endereço são opcionais. Não é necessário coletar CPF.
- Misture materiais do estoque, serviços do catálogo e itens manuais na mesma proposta. Materiais manuais aceitam descrição, quantidade fracionada e valor unitário.
- Informe desconto, validade e observações. Totais são calculados no servidor em centavos e os valores monetários aceitam no máximo duas casas decimais.
- Gere o PDF pela tela de detalhes. Web baixa o arquivo; no Android o botão Gerar / compartilhar PDF abre o compartilhamento do sistema com o documento obtido por chamada autenticada.
- O PDF inclui razão social/nome fantasia, CNPJ, contato e endereço da empresa, destinatário, descrição, quantidade, preço, subtotal, desconto, total, validade e observações. O orçamento guarda os dados da empresa e do destinatário no momento da criação.

## Estoque e aprovação

Criar ou aprovar orçamento não reserva nem baixa estoque. A referência ao produto permite a baixa no fluxo existente da OS quando executada/finalizada. Itens manuais não têm referência e não movimentam saldo. Antes da execução, confira disponibilidade.

Futuro cliente não é incluído na lista de clientes apenas por receber orçamento. Se uma proposta aprovada for convertida em OS, um cadastro é criado na mesma transação e ligado à proposta. A conversão só acontece uma vez, protegida pelo status e lock do orçamento. O fluxo usa o responsável que faz a conversão; agende/atribua a OS conforme a operação da empresa.

## Implantação

1. Faça o backup habitual da produção.
2. Atualize o código na EC2 e execute `npm run migrate`. O patch 019 permite destinatário livre, adiciona snapshots e inclui o campo de e-mail de clientes quando ausente. Orçamentos antigos mantêm o funcionamento por cliente.
3. Compile o painel e reinicie a API. Nenhuma alteração foi aplicada automaticamente à produção nesta implementação.
4. Gere/instale um APK com esta versão; os APKs anteriores não contêm os campos novos. O ajuste anterior da área segura do menu está incluído no código.
5. Confira os dados da empresa em Minha conta antes de criar a proposta; uma alteração posterior não modifica o snapshot já emitido.

## Validação

107 testes Node aprovados; build Vite e exportação Expo concluídos. PostgreSQL 16 isolado confirmou migração repetida, cliente cadastrado, prospect, itens mistos, estoque preservado, isolamento por empresa, preservação dos dados da empresa e conversão em OS.

PDF renderizado e inspecionado visualmente em proposta de uma página e proposta de 100 itens em oito páginas, com cabeçalhos e rodapés. O compartilhamento nativo Android precisa ser validado no aparelho.

Teste de integração local: configure SECURITY_TEST_DATABASE_URL para PostgreSQL descartável em loopback, com nome iniciado por security_, e execute `npm run test:orcamentos:postgres`. Não use banco com dados reais. Esse teste também está no job PostgreSQL do CI.
