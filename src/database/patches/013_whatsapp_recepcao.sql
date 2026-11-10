CREATE TABLE IF NOT EXISTS whatsapp_automacao (
  empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  nome_atendimento VARCHAR(150) NOT NULL DEFAULT '',
  boas_vindas VARCHAR(700) NOT NULL DEFAULT 'Vamos entender o que você precisa para encaminhar seu atendimento.',
  horario_informativo VARCHAR(300) NOT NULL DEFAULT '',
  encaminhamento VARCHAR(500) NOT NULL DEFAULT 'Nossa equipe dará continuidade ao seu atendimento por aqui.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS triagem JSONB NOT NULL DEFAULT '{}';
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS bot_tentativas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS bot_versao INTEGER NOT NULL DEFAULT 1;
UPDATE whatsapp_conversas SET bot_ativo=FALSE WHERE fila_status='ESPERA';
CREATE TABLE IF NOT EXISTS whatsapp_respostas_bot (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  conversa_id INTEGER NOT NULL REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
  mensagem_origem_id INTEGER NOT NULL UNIQUE REFERENCES whatsapp_mensagens(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  texto TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  executar_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  ultimo_erro VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bot_pendentes ON whatsapp_respostas_bot(executar_em,id)
  WHERE concluido_em IS NULL AND cancelado_em IS NULL;
