# Perfil da empresa e validação de documentos

Os perfis operacionais são ADMIN (administrador da empresa) e TECNICO. O perfil GESTOR legado foi preservado para compatibilidade. O administrador cria técnicos pela tela Equipe técnica na web ou Técnicos na gestão do mobile. O backend sempre vincula o técnico à empresa da sessão, sem aceitar empresa ou perfil no corpo do cadastro.

Para provisionar a empresa e seu administrador, configure ADMIN_COMPANY, ADMIN_CNPJ, ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no ambiente e execute `npm run admin:create`. O comando administrativo existente pode redefinir a senha de um administrador já cadastrado; execute somente para a conta desejada. Não há cadastro público que conceda acesso a empresas existentes apenas por conhecer seu CNPJ.

Aplique a migração `npm run migrate` antes de iniciar esta versão. O patch 016 adiciona nome fantasia, endereço, cidade, UF e CEP. Esta alteração não executa migrações automaticamente no banco de produção.

Web: Minha conta. Mobile: Perfil. Ambos exibem os dados da empresa, permitem edição pelo ADMIN e oferecem consulta de CPF/CNPJ.

- GET /conta/perfil: dados do usuário e da empresa autenticada.
- PUT /conta/empresa: edição restrita ao ADMIN da própria empresa.
- POST /conta/documentos/consultar: corpo {"documento":"..."}, exige autenticação, limite de 10 chamadas por minuto/IP.

CPF: checagem local de formato e dígitos, sem consultar pessoas. Um CPF matematicamente válido não comprova existência, titularidade nem situação cadastral.

CNPJ: suporta números e o formato alfanumérico; consulta gratuita sem chave em https://brasilapi.com.br/api/cnpj/v1/{cnpj}. Retorna dados públicos selecionados e situação cadastral, sem confirmar que o usuário representa a empresa. Campos consultados só são gravados quando o administrador escolhe salvar. Falhas externas retornam 503, ausência na base retorna 404; nenhuma dessas respostas classifica o CNPJ como falso. O salvamento exige dígitos válidos, sem depender da disponibilidade do serviço externo.

A validação adicionada atende os campos da empresa e a consulta do perfil. O cadastro legado de documentos de clientes continua com seu fluxo anterior.

Validação executada: suíte Node completa (78 testes), build Vite e análise sintática JSX dos componentes mobile. Não foi executado teste no dispositivo nem consulta real de documentos de usuários.
