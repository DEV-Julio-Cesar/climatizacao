-- Patch 001 — Adiciona coluna para invalidação de tokens após troca de senha
-- Execute uma vez no banco de produção:
--   psql $DATABASE_URL -f src/database/patches/001_senha_alterada_em.sql

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS senha_alterada_em TIMESTAMPTZ;

COMMENT ON COLUMN usuarios.senha_alterada_em IS
  'Preenchido em UPDATE quando o usuário troca a senha. '
  'O authMiddleware rejeita tokens com iat < senha_alterada_em.';
