# Infraestrutura e banco: verificacao de 08/11/2026

## Ajustes efetuados no projeto

- Removido o manifesto de hospedagem anterior.
- Mobile/.env, mobile/.env.example, perfis EAS preview/production e exemplo de recuperacao de senha usam a API AWS documentada: https://13-58-212-142.nip.io.
- O link de privacidade mobile deriva de BASE_URL, acompanhando a API de cada ambiente.
- Documentacao de hospedagem atualizada para AWS. A action amazon-ecs-render-task-definition e uma ferramenta AWS e permanece no pipeline; render() de React tambem permanece.
- O roteiro de instalacao EC2 deixa de gerar DB_SSL_REJECT_UNAUTHORIZED=false, incompat?vel com os requisitos atuais de producao. Para banco local, o driver usa loopback sem TLS; para banco remoto, exige validacao do certificado.

## Evidencias confirmadas

| Ambiente | Resultado |
|---|---|
| .env local | DATABASE_URL aponta para Neon; conexao confirmada por SELECT 1 em transacao somente leitura |
| API AWS documentada | /health respondeu 200 com status ok; /health/ready respondeu 200 com database ok |
| Roteiro de instalacao EC2 | Provisiona PostgreSQL local na instancia e gera DATABASE_URL para 127.0.0.1 |
| Banco efetivo do servico em producao | Ainda depende de verificacao administrativa AWS/SSM; o health check nao identifica o provedor |

Nao foi alterada DATABASE_URL, migrado dado, excluido banco ou configurado backup. A confirmacao de conexao nao prova backup ou equivalencia dos dados entre dois bancos.

## Comando de diagnostico

`npm run database:where` identifica o provedor configurado, sem imprimir credenciais. `npm run database:where -- --conectar` acrescenta uma consulta de conectividade somente leitura. Para arquivo especifico, use `--env-file=/opt/climasaas/.env` junto aos argumentos; variaveis do processo tem precedencia, como na API.

Execute no ambiente do servico para avaliar producao. Executar no computador local continua avaliando apenas a configuracao local.

## Validacao local

99 testes aprovados e exportacao Expo concluida apos a troca do endpoint. Nenhuma referencia ao provedor antigo permanece no codigo/configuracao/documentacao ativos; nomes de metodos React e da action AWS nao representam dependencias de hospedagem.
