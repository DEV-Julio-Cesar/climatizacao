# Mobile: assinatura, galeria e tema — 29/10/2026

## Entregue

- **Nome do responsável:** tela de assinatura exige nome de 3 a 150 caracteres. O nome é salvo nos metadados da assinatura, preservado na fila offline e exibido junto da imagem no PDF. A API valida o campo quando informado; assinaturas antigas sem nome continuam compatíveis. Isso não constitui assinatura digital qualificada.
- **Finalização preservada:** assinatura, check-out com GPS e finalização entram juntos em uma transação SQLite antes do envio. No Android/iOS usa conexão transacional exclusiva, sem misturar gravações de outras rotinas. Cada operação recebe chave de reenvio. Um toque repetido não cria outro lote enquanto a tela está salvando ou já confirmou o lote.
- **Recuperação segura:** a imagem é mantida até a confirmação do envio e remoção da operação da fila local. Falha no SQLite não apaga o arquivo antes dessa confirmação. O lote verifica se a conta ainda é a mesma antes de gravar e antes do commit.
- **Galeria:** toque em uma evidência nos detalhes da O.S. para abrir em tela cheia. Pinça, arraste, dois toques, botões de zoom (1x a 5x), anterior/próxima e ajuste da imagem. Ao abrir, busca links atuais; botão Recarregar renova os dados e tenta novamente. Links expirados precisam de conexão para serem renovados. Pressionar e segurar a miniatura continua oferecendo exclusão, sujeita às regras da API.
- **Tema:** navegação, abas, Agenda, Clientes, Gestão, Detalhes da OS, Câmera, Execução, Assinatura, Finalizadas e Sincronização agora usam a preferência de tema. Login/Perfil já usavam. O quadro de assinatura permanece branco para preservar o contraste da tinta.
- **Sistema:** configuração nativa muda para aparência automática e inclui `expo-system-ui` compatível com o SDK instalado. Preferências inválidas/corrompidas não interrompem a abertura do app.

## Implantação

1. Aplique `npm run migrate`: patch `008_nome_assinante.sql` acrescenta `os_fotos.assinante_nome`.
2. Atualize as dependências mobile (`npm --prefix mobile ci`) e gere um novo build nativo Android/iOS para incorporar o módulo e a configuração de aparência. Exportar a versão web não atualiza um APK instalado.
3. Publique a API antes ou junto do app atualizado. O campo da assinatura permanece opcional na API para permitir envio das filas de versões antigas.
4. PDFs antigos são preservados; não recebem automaticamente o nome de assinaturas antigas que nunca tiveram esse dado.

## Validação

Validação local: 64 testes aprovados e um teste PostgreSQL ignorado por falta de banco de testes. Compilação do painel e exportação web do mobile concluídas.

Testes verificam validação/normalização do nome, persistência no upload, reenvio restrito à mesma OS, nome no PDF, limites de zoom/deslocamento, lote atômico com rollback, conexão exclusiva, troca de conta e ordem da limpeza do arquivo. O validador rápido passa a selecionar também os testes da galeria quando sua lógica muda. Build/exportação mobile verifica compilação, sem comprovar gestos nativos ou aparência visual.

É necessária homologação em aparelho: pinça/arraste e rotação, assinatura com teclado aberto, GPS negado, falta de rede, reinício com lote pendente, mudança de tema e atualização de uma instalação antiga. Não houve execução de migrações no banco configurado nem homologação visual neste ambiente.

O tema ainda precisa ser aplicado às demais telas de cadastros/gestão/mapas. Recuperação de senha com entrega, tempo real, bot de agendamento, paginação e armazenamento externo continuam no backlog.
