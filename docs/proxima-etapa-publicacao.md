# Próxima etapa: preparar uma publicação verificável

Implementação local em 08/11/2026, após as correções de segurança. Nenhum deploy, migração no banco configurado no .env, troca de segredo ou alteração de cadastro foi executado nesta etapa.

## Entregue

- `npm run security:preflight`: diagnóstico de prontidão para produção. Lê configuração sem imprimir valores, senhas, URLs de conexão ou hashes de segredos. Valida as quatro chaves independentes, PostgreSQL, HTTPS, origens CORS e configuração das integrações.
- `npm run security:preflight -- --banco`: acrescenta consultas dentro de `BEGIN READ ONLY`, com timeout de cinco segundos e `ROLLBACK` ao final. Verifica patches pendentes, duplicatas de CNPJ normalizado, grants com curinga e vínculos WhatsApp. Não aplica correções.
- `--json`: relatório estruturado com nomes de verificações, estados e contagens; sem credenciais ou dados de clientes.
- Código de saída: 0 quando todas as verificações exigidas foram concluídas sem erro; 1 com erro; 2 quando faltam verificações. Avisos descrevem limitações que precisam ser avaliadas.
- `npm run security:config`: verifica requisitos de inicialização. Em produção exige segredos independentes, URL explícita de PostgreSQL e validação de certificado; não consulta o banco.
- A conexão PostgreSQL usa o hostname real para reconhecer loopback. Senha contendo localhost ou domínio como localhost.example.test não desativam TLS. Parâmetros da URL não podem sobrepor a política de validação de certificados. Certificados explicitamente configurados na URL são preservados; a validação de hostname não é desabilitada.
- CI instala dependências mobile antes dos testes que as utilizam e passa a atender main/master. Um job separado executa a integração em PostgreSQL 16 descartável.
- O workflow AWS aguarda o CI reutilizável antes de obter credenciais e publicar a imagem. Não foi acionado no GitHub nesta etapa.
 - Os modelos AWS ECS declaram as chaves exigidas. Os valores/ARNs devem ser cadastrados no provedor; editar o modelo nao altera uma implantacao existente.

## Diagnóstico local observado

O diagnóstico foi executado apenas sobre os valores locais, avaliando-os como uma configuração de produção:

- DATA_ENCRYPTION_SECRET, FILE_URL_SECRET e EMAIL_QUEUE_SECRET precisam ser configurados conforme os requisitos.
- APP_URL e CORS_ORIGIN precisam de valores HTTPS adequados ao ambiente publicado.
- WhatsApp e SMTP não estão completos para ativar essas funções.
- O banco remoto não foi consultado. Pendências de migração e estado de dados reais ainda não foram confirmados.

Uma configuração de desenvolvimento pode usar URLs locais intencionalmente; isso não a torna pronta para publicação. Não basta gerar novas chaves: siga a estratégia de preservação/rotação de dados em [correcoes-seguranca.md](correcoes-seguranca.md), para não perder acesso a documentos já cifrados.

## Validação executada

96 testes Node aprovados. Integração de segurança e diagnóstico somente leitura aprovados em PostgreSQL 16 isolado. YAMLs de CI e deploy AWS e consistência do package-lock verificados localmente. Execução remota do Actions, Docker/ECS e teste nativo Android/iOS permanecem para homologação.

## Sequência de continuação

1. Definir URLs públicas e provedores efetivamente usados; preparar as chaves com preservação das versões anteriores.
2. Ensaiar migrações e rotação em uma cópia protegida de homologação, incluindo restauração do backup.
3. Configurar canais WhatsApp por empresa e verificar assinatura/envio no ambiente de homologação.
4. Validar login, troca de conta offline, câmera, AES/SecureStore, notificações e PDFs em aparelho com uma nova compilação nativa.
5. Depois da homologação, publicar backend/web/mobile de maneira coordenada e monitorar erros.
6. Próximo ciclo funcional: gestão do ciclo de vida dos técnicos e sessões, controle de acesso aos documentos por finalidade e atendimento às solicitações de privacidade.

Referência para a chamada reutilizável do CI: [documentação oficial do GitHub](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
