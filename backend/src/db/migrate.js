import 'dotenv/config';
import { query } from './pool.js';

const SCHEMA = `
-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  senha       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'atendente' CHECK (role IN ('master','atendente','bot')),
  cor         TEXT DEFAULT '#00B8C0',
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LEADS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome              TEXT NOT NULL,
  telefone          TEXT,
  email             TEXT,
  origem            TEXT DEFAULT 'WhatsApp',
  interesse         TEXT DEFAULT 'Consulta',
  status            TEXT DEFAULT 'Novo lead',
  responsavel_id    TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  valor_proposta    NUMERIC(10,2) DEFAULT 0,
  servico           TEXT,
  data_entrada      DATE DEFAULT CURRENT_DATE,
  data_retorno      DATE,
  observacoes       TEXT,
  motivo_perda      TEXT,
  tags              TEXT[] DEFAULT '{}',
  vittasys_id       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_responsavel ON leads(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_leads_data_entrada ON leads(data_entrada DESC);
CREATE INDEX IF NOT EXISTS idx_leads_nome_trgm ON leads USING gin(nome gin_trgm_ops);

-- ─── CONVERSATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversas (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp','instagram')),
  contact_name    TEXT,
  contact_id      TEXT,                          -- remoteJid or IG sender ID
  phone           TEXT,
  lead_id         TEXT REFERENCES leads(id) ON DELETE SET NULL,
  responsavel_id  TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread          INT DEFAULT 0,
  bot_ativo       BOOLEAN DEFAULT false,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_channel ON conversas(channel);
CREATE INDEX IF NOT EXISTS idx_conv_last ON conversas(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_responsavel ON conversas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_conv_unread ON conversas(unread) WHERE unread > 0;
CREATE INDEX IF NOT EXISTS idx_conv_contact_id ON conversas(contact_id);

-- ─── MESSAGES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensagens (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversa_id TEXT NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  from_type   TEXT NOT NULL CHECK (from_type IN ('me','contact','bot','system')),
  type        TEXT DEFAULT 'text' CHECK (type IN ('text','image','audio','video','document')),
  content     TEXT,
  filename    TEXT,
  mimetype    TEXT,
  file_size   INT,
  sender_id   TEXT,
  sender_nome TEXT,
  status      TEXT DEFAULT 'sent',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_conversa ON mensagens(conversa_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_created ON mensagens(created_at DESC);

-- ─── QUICK REPLIES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS respostas_rapidas (
  id      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  titulo  TEXT NOT NULL,
  texto   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo      TEXT,
  titulo    TEXT,
  texto     TEXT,
  lead_id   TEXT,
  conv_id   TEXT,
  lida      BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_lida ON notificacoes(lida) WHERE lida = false;
CREATE INDEX IF NOT EXISTS idx_notif_created ON notificacoes(created_at DESC);

-- ─── BOT CONFIG ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON conversas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- Trigram extension for full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
`;

async function migrate() {
  console.log('🗄️  Running VittaHub migrations...');
  try {
    await query(SCHEMA);
    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
