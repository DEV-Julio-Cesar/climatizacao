CREATE TABLE IF NOT EXISTS os_sequencias (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ano INTEGER NOT NULL CHECK(ano BETWEEN 2000 AND 9999),
  ultimo_numero INTEGER NOT NULL DEFAULT 0 CHECK(ultimo_numero>=0),
  PRIMARY KEY(empresa_id,ano)
);

CREATE OR REPLACE FUNCTION preparar_identificacao_os() RETURNS TRIGGER AS $$
DECLARE ano_os INTEGER; sequencia INTEGER; cliente_dados RECORD; equipamento_dados RECORD;
BEGIN
  ano_os := EXTRACT(YEAR FROM COALESCE(NEW.created_at,NOW()))::INTEGER;
  IF NEW.numero IS NULL OR NEW.numero='' THEN
    INSERT INTO os_sequencias(empresa_id,ano,ultimo_numero) VALUES(NEW.empresa_id,ano_os,1)
    ON CONFLICT(empresa_id,ano) DO UPDATE SET ultimo_numero=os_sequencias.ultimo_numero+1
    RETURNING ultimo_numero INTO sequencia;
    NEW.numero := 'OS-'||ano_os||'-'||LPAD(sequencia::TEXT,6,'0');
  END IF;
  SELECT c.* INTO cliente_dados FROM clientes c WHERE c.id=NEW.cliente_id AND c.empresa_id=NEW.empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente da O.S. não pertence à empresa.'; END IF;
  IF NEW.cliente_snapshot IS NULL THEN NEW.cliente_snapshot := jsonb_build_object('id',cliente_dados.id,'nome',cliente_dados.nome,'telefone',cliente_dados.telefone,'tipo_pessoa',cliente_dados.tipo_pessoa,'razao_social',cliente_dados.razao_social,'nome_fantasia',cliente_dados.nome_fantasia); END IF;
  IF NEW.endereco_execucao_snapshot IS NULL THEN NEW.endereco_execucao_snapshot := jsonb_build_object('endereco',cliente_dados.endereco,'numero',cliente_dados.numero,'complemento',cliente_dados.complemento,'bairro',cliente_dados.bairro,'cep',cliente_dados.cep,'cidade',cliente_dados.cidade,'estado',cliente_dados.estado,'latitude',cliente_dados.latitude,'longitude',cliente_dados.longitude); END IF;
  IF NEW.aparelho_id IS NOT NULL AND NEW.equipamento_snapshot IS NULL THEN
    SELECT a.* INTO equipamento_dados FROM aparelhos a WHERE a.id=NEW.aparelho_id AND a.empresa_id=NEW.empresa_id AND a.cliente_id=NEW.cliente_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Equipamento da O.S. não pertence ao cliente.'; END IF;
    NEW.equipamento_snapshot := jsonb_build_object('id',equipamento_dados.id,'marca',equipamento_dados.marca,'modelo',equipamento_dados.modelo,'capacidade',equipamento_dados.capacidade,'numero_serie',equipamento_dados.numero_serie,'patrimonio',equipamento_dados.patrimonio,'tipo_gas',equipamento_dados.tipo_gas,'ambiente',equipamento_dados.ambiente);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preparar_identificacao_os ON ordens_servico;
CREATE TRIGGER trg_preparar_identificacao_os BEFORE INSERT ON ordens_servico FOR EACH ROW EXECUTE FUNCTION preparar_identificacao_os();

UPDATE ordens_servico SET numero='OS-LEGADO-'||LPAD(id::TEXT,8,'0') WHERE numero IS NULL OR numero='';
UPDATE ordens_servico os SET cliente_snapshot=jsonb_build_object('id',c.id,'nome',c.nome,'telefone',c.telefone,'tipo_pessoa',c.tipo_pessoa,'razao_social',c.razao_social,'nome_fantasia',c.nome_fantasia),endereco_execucao_snapshot=jsonb_build_object('endereco',c.endereco,'numero',c.numero,'complemento',c.complemento,'bairro',c.bairro,'cep',c.cep,'cidade',c.cidade,'estado',c.estado,'latitude',c.latitude,'longitude',c.longitude) FROM clientes c WHERE c.id=os.cliente_id AND c.empresa_id=os.empresa_id AND (os.cliente_snapshot IS NULL OR os.endereco_execucao_snapshot IS NULL);
UPDATE ordens_servico os SET equipamento_snapshot=jsonb_build_object('id',a.id,'marca',a.marca,'modelo',a.modelo,'capacidade',a.capacidade,'numero_serie',a.numero_serie,'patrimonio',a.patrimonio,'tipo_gas',a.tipo_gas,'ambiente',a.ambiente) FROM aparelhos a WHERE a.id=os.aparelho_id AND a.empresa_id=os.empresa_id AND os.equipamento_snapshot IS NULL;
