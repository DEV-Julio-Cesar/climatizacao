# 01 — Visão Geral do Sistema

## O que é o ClimaSaaS

ClimaSaaS é uma plataforma SaaS multi-tenant para empresas de climatização gerenciarem toda a operação técnica: criação e execução de ordens de serviço, controle de estoque, emissão de orçamentos, contratos preventivos, atendimento via WhatsApp e relatórios gerenciais.

O sistema é composto por três camadas independentes que se comunicam via API REST:

| Camada | Tecnologia | Público-alvo |
|---|---|---|
| API Backend | Node.js 22 + Express 4 + PostgreSQL | — |
| App Mobile | React Native (Expo SDK 57) | Técnicos de campo |
| Painel Web | React 19 + Vite | Gestores e administrativo |

---

## Modelo de Negócio (Multi-Tenant)

Cada **empresa** é um tenant isolado. As entidades são vinculadas à empresa diretamente por `empresa_id` ou por relacionamentos, como fotos vinculadas à OS. A API aplica filtros e validações a partir da sessão. Há exceções estruturais, como a tabela raiz `empresas` e checklists globais; esta revisão não comprova isolamento de todas as consultas.

```
Empresa A ──► usuarios, clientes, aparelhos, ordens_servico, produtos...
Empresa B ──► usuarios, clientes, aparelhos, ordens_servico, produtos...
```

---

## Perfis de Usuário e Permissões

O sistema tem três perfis com permissões configuráveis individualmente:

| Perfil | Descrição | Pode |
|---|---|---|
| `TECNICO` | Executar atendimentos em campo | Agenda, OS, fotos, checklist, catálogo |
| `GESTOR` | Gerenciar a operação | Tudo acima + reagendar, financeiro, relatórios, configurações |
| `ADMIN` | Acesso total (`*`) | Sem restrições |

Permissões podem ser sobrescritas por usuário via tabela `usuario_permissoes` (sistema RBAC).

**Permissões disponíveis:**

```
AGENDA_VISUALIZAR    OS_CRIAR           OS_EXECUTAR       OS_REAGENDAR
CLIENTES_VISUALIZAR  CLIENTES_GERENCIAR ESTOQUE_VISUALIZAR ESTOQUE_GERENCIAR
FINANCEIRO_VISUALIZAR FINANCEIRO_GERENCIAR GESTAO_VISUALIZAR GESTAO_GERENCIAR
ATENDIMENTO_VISUALIZAR ATENDIMENTO_GERENCIAR
```

---

## Stack Tecnológica

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | 22 | Runtime |
| Express | 4.19 | Framework HTTP |
| PostgreSQL | — | Banco de dados (Neon em produção) |
| `pg` | 8.12 | Driver PostgreSQL |
| `jsonwebtoken` | 9 | JWT HS256 (access 8h + refresh 30d) |
| `bcryptjs` | 2.4 | Hash de senhas (custo 12) |
| `zod` | 4.6 | Validação de entrada; migração e contratos verificados na homologação |
| `multer` | 1.4 | Upload de arquivos (memória, 8 MB) |
| `pdfkit` | 0.15 | Geração de PDFs |
| `axios` | 1.7 | Chamadas HTTP (WhatsApp API) |
| `helmet` | 8 | Cabeçalhos de segurança |
| `express-rate-limit` | 8 | Rate limiting |
| `compression` | 1.8 | Gzip |
| `qrcode` | 1.5 | QR Codes de equipamentos |
| `dotenv` | 16 | Variáveis de ambiente |

### Mobile
| Tecnologia | Uso |
|---|---|
| Expo SDK 57 | Runtime + toolchain |
| React Native 0.86 | Framework mobile |
| `expo-camera` | Câmera para evidências fotográficas |
| `expo-sqlite` | Banco offline SQLite |
| `expo-secure-store` | Armazenamento seguro de tokens |
| `expo-location` | GPS para check-in/check-out/fotos |
| `expo-notifications` | Push notifications |
| `expo-image-manipulator` | Resize + compress de fotos |
| `expo-file-system` | Cache local de arquivos |
| `expo-network` | Verificação de conectividade |
| `react-native-maps` | Mapa nativo |
| `react-native-signature-canvas` | Canvas de assinatura do cliente |
| `react-native-qrcode-svg` | Exibição de QR Code |
| `@react-navigation` | Navegação stack + bottom tabs |

### Web
| Tecnologia | Uso |
|---|---|
| React 19 + Vite | SPA |
| `react-big-calendar` | Calendário interativo (PainelDespacho) |
| `react-leaflet` + `leaflet` | Mapa OpenStreetMap |
| `moment` | Datas no calendário |
| `axios` | Chamadas à API |

---

## Armazenamento de Arquivos

Uma decisão de design importante: **fotos e PDFs são armazenados diretamente no PostgreSQL como `BYTEA`**, não em serviços externos como S3. Isso simplifica o deploy (sem dependências externas) e garante que arquivos sobrevivam a reinicializações do servidor, mas tem implicações de escala.

- Fotos: `os_fotos.conteudo BYTEA` + `storage_key UUID` → servidas em `GET /arquivos/fotos/:chave`
- PDFs: `ordens_servico.pdf_conteudo BYTEA` + `pdf_storage_key UUID` → servidos em `GET /arquivos/ordens/:chave.pdf`

---

Fotos/PDFs exigem link assinado temporário por arquivo e empresa, com cache `private, no-store`. Respostas autenticadas recebem links de 15 minutos; PDFs enviados ao WhatsApp usam sete dias. O UUID sozinho não autoriza acesso.

## Infraestrutura de Produção

Há configuração para **Render** (arquivo `render.yaml`); a implantação efetiva não foi verificada nesta revisão:
- Serviço web Node.js, plano free, região Ohio
- Build: instala API + web, faz build do Vite
- Start: executa migrations → inicia servidor
- Banco: PostgreSQL externo via Neon

Há também uma configuração Docker (`Dockerfile`) e pipeline CI/CD (`deploy-aws.yml`) para AWS EC2/ECS.

---

## Segurança Implementada

- **JWT** com par access-token (8h) + refresh-token (30d)
- **Invalidação de sessão** ao trocar senha (`senha_alterada_em` comparada com `iat` do token)
- **Rate limiting** no login (10/15min) e refresh (30/15min)
- **CORS** restrito por lista de origens (`CORS_ORIGIN`)
- **Helmet** com CSP configurada
- **Validação de magic bytes** em uploads (impede MIME spoofing)
- **Soft delete** nas principais entidades; há exclusões físicas de fotos e substituição de itens/checklist
- **Multi-tenant** com filtros por empresa e validação de relacionamentos; cobertura integral exige auditoria específica
- **Transações atômicas** em operações críticas
- **Logger estruturado** com mascaramento automático de campos sensíveis (senha, token, CPF, telefone)
- **Privacidade**: resumo pessoal paginado (`GET /conta/dados`), desativação com senha e revogação (`DELETE /conta/dados`) e protocolos para análise de direitos. Isso não constitui anonimização completa nem certificação de adequação. Veja [LGPD e proteção de dados](./18-lgpd-protecao-dados.md).
