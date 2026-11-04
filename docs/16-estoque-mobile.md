# Estoque pelo aplicativo

Em **Gestão → Catálogo e estoque**, usuários com `ESTOQUE_GERENCIAR` podem cadastrar itens e movimentar o estoque central:

- **Entrada:** soma a quantidade recebida.
- **Saída:** retira a quantidade informada sem permitir saldo negativo.
- **Ajuste de saldo:** define o saldo final do inventário, inclusive zero.

As quantidades aceitam vírgula e até duas casas decimais. O aplicativo exige um motivo e mostra uma confirmação antes de enviar. A API também exige motivo em saídas e ajustes, bloqueia reduções abaixo das reservas pendentes e registra a movimentação com empresa e usuário. Operações usam bloqueio transacional do produto; reenvios com a mesma chave não duplicam o lançamento.

O histórico mostra as últimas 200 movimentações do produto, com data, responsável, observação e referências a técnico/O.S. quando existentes. Para movimentos de ajuste, a quantidade é o saldo definido, não a diferença entre saldos. O histórico inclui operações relacionadas ao estoque central e aos técnicos.

A consulta requer `ESTOQUE_VISUALIZAR`. A tela de gestão usa o saldo central, enquanto a consulta para atendimento continua usando o saldo disponível do técnico quando houver. Permissões são consultadas na sessão atual e continuam sendo verificadas pelo servidor.

A tela oferece busca por nome/SKU, atualização manual, modo escuro e formulários roláveis com área segura e tratamento do teclado. Movimentações exigem conexão; não são colocadas na fila offline. Se houver falha sem confirmação, consulte o histórico antes de iniciar uma operação diferente.

## Publicação e validação

Publique a atualização da API antes do novo APK: versões antigas não aceitam `SAIDA`, ajuste zero nem a chave de idempotência deste fluxo. A proteção de reenvios usa a tabela `operacoes_idempotentes` já criada pelas migrações existentes; não há migração nova.

Testes específicos: `node --test --test-isolation=none test/estoque-mobile.test.js`. Validar no aparelho entrada fracionada, saída, inventário para zero, rejeição de saldo reservado, histórico, teclado, área segura e perfil sem permissão de gerenciamento.
