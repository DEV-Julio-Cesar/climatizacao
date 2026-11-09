ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK(perfil IN ('TECNICO','GESTOR','ADMIN','MASTER'));
CREATE UNIQUE INDEX usuario_master_unico ON usuarios ((perfil)) WHERE perfil='MASTER' AND deleted_at IS NULL;
