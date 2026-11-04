CREATE OR REPLACE FUNCTION climasaas_notificar_evento() RETURNS trigger AS $$
DECLARE registro RECORD; empresa INTEGER; tipo TEXT;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
  END IF;
  IF TG_OP='DELETE' THEN registro:=OLD; ELSE registro:=NEW; END IF;
  IF TG_TABLE_NAME IN('ordens_servico','pagamentos') THEN
    empresa:=registro.empresa_id; tipo:='agenda';
  ELSIF TG_TABLE_NAME='os_fotos' THEN
    SELECT empresa_id INTO empresa FROM ordens_servico WHERE id=registro.os_id;
    tipo:='agenda';
  ELSIF TG_TABLE_NAME='whatsapp_conversas' THEN
    empresa:=registro.empresa_id; tipo:='whatsapp';
  ELSIF TG_TABLE_NAME='whatsapp_mensagens' THEN
    SELECT empresa_id INTO empresa FROM whatsapp_conversas WHERE id=registro.conversa_id;
    tipo:='whatsapp';
  END IF;
  IF empresa IS NOT NULL THEN
    PERFORM pg_notify('climasaas_eventos',json_build_object('empresa_id',empresa,'tipo',tipo)::text);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_os_evento ON ordens_servico;
CREATE TRIGGER tr_os_evento AFTER INSERT OR UPDATE OR DELETE ON ordens_servico FOR EACH ROW EXECUTE FUNCTION climasaas_notificar_evento();
DROP TRIGGER IF EXISTS tr_foto_evento ON os_fotos;
CREATE TRIGGER tr_foto_evento AFTER INSERT OR UPDATE OR DELETE ON os_fotos FOR EACH ROW EXECUTE FUNCTION climasaas_notificar_evento();
DROP TRIGGER IF EXISTS tr_pagamento_evento ON pagamentos;
CREATE TRIGGER tr_pagamento_evento AFTER INSERT OR UPDATE OR DELETE ON pagamentos FOR EACH ROW EXECUTE FUNCTION climasaas_notificar_evento();
DROP TRIGGER IF EXISTS tr_conversa_evento ON whatsapp_conversas;
CREATE TRIGGER tr_conversa_evento AFTER INSERT OR UPDATE OR DELETE ON whatsapp_conversas FOR EACH ROW EXECUTE FUNCTION climasaas_notificar_evento();
DROP TRIGGER IF EXISTS tr_mensagem_evento ON whatsapp_mensagens;
CREATE TRIGGER tr_mensagem_evento AFTER INSERT OR UPDATE OR DELETE ON whatsapp_mensagens FOR EACH ROW EXECUTE FUNCTION climasaas_notificar_evento();
