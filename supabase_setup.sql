-- Tabela de leads do funil de vendas
CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  name        TEXT,
  channel     TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email')),
  stage       TEXT NOT NULL DEFAULT 'QUALIFICACAO' CHECK (stage IN ('QUALIFICACAO', 'OFERTA', 'POS_VENDA')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabela de histórico de mensagens por conversa
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  channel     TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  stage       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índice para buscar mensagens de um contato rapidamente
CREATE INDEX IF NOT EXISTS idx_messages_phone_channel
  ON messages (phone, channel, created_at);

-- RLS: apenas a service key pode ler/escrever (o agente usa service key no backend)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Política: bloqueia acesso público — apenas service key (bypass RLS) tem acesso
CREATE POLICY "Apenas service key" ON leads FOR ALL USING (false);
CREATE POLICY "Apenas service key" ON messages FOR ALL USING (false);
