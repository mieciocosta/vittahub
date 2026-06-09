import { query } from './pool.js';

// Runs idempotent CREATE TABLE IF NOT EXISTS on startup
export default async function runMigrate() {
  try {
    await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await query(`CREATE EXTENSION IF NOT EXISTS unaccent`).catch(() => {});

    await query(`CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'atendente', cor TEXT DEFAULT '#00B8C0',
      ativo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nome TEXT NOT NULL, telefone TEXT, email TEXT,
      origem TEXT DEFAULT 'WhatsApp', interesse TEXT DEFAULT 'Consulta',
      status TEXT DEFAULT 'Novo lead', responsavel_id TEXT,
      valor_proposta NUMERIC(10,2) DEFAULT 0, servico TEXT,
      data_entrada DATE DEFAULT CURRENT_DATE, data_retorno DATE,
      observacoes TEXT, motivo_perda TEXT, tags TEXT[] DEFAULT '{}',
      vittasys_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_leads_resp ON leads(responsavel_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_leads_nome ON leads USING gin(nome gin_trgm_ops)`);

    await query(`CREATE TABLE IF NOT EXISTS conversas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      channel TEXT NOT NULL, contact_name TEXT, contact_id TEXT UNIQUE,
      phone TEXT, lead_id TEXT, responsavel_id TEXT,
      last_message TEXT, last_message_at TIMESTAMPTZ DEFAULT NOW(),
      unread INT DEFAULT 0, bot_ativo BOOLEAN DEFAULT false,
      profile_pic TEXT,
      tags TEXT[] DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Add profile_pic column if not exists (for existing databases)
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS profile_pic TEXT`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS status_atend TEXT DEFAULT 'aberto'`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_conv_status ON conversas(status_atend)`).catch(() => {});

    await query(`CREATE INDEX IF NOT EXISTS idx_conv_last ON conversas(last_message_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_conv_channel ON conversas(channel)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_conv_contact ON conversas(contact_id)`);

    await query(`CREATE TABLE IF NOT EXISTS mensagens (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversa_id TEXT NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
      from_type TEXT NOT NULL, type TEXT DEFAULT 'text', content TEXT,
      filename TEXT, mimetype TEXT, file_size INT,
      sender_id TEXT, sender_nome TEXT, status TEXT DEFAULT 'sent',
      wa_msg_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS wa_msg_id TEXT`).catch(() => {});
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_wa_id ON mensagens(wa_msg_id) WHERE wa_msg_id IS NOT NULL`).catch(() => {});

    await query(`CREATE INDEX IF NOT EXISTS idx_msg_conv ON mensagens(conversa_id, created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_msg_conv_desc ON mensagens(conversa_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_conv_last_desc ON conversas(last_message_at DESC)`).catch(()=>{});

    await query(`CREATE TABLE IF NOT EXISTS respostas_rapidas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      titulo TEXT NOT NULL, texto TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`CREATE TABLE IF NOT EXISTS notificacoes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tipo TEXT, titulo TEXT, texto TEXT, lead_id TEXT, conv_id TEXT,
      lida BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`CREATE INDEX IF NOT EXISTS idx_notif_lida ON notificacoes(lida) WHERE lida = false`);

    await query(`CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY, valor JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Seed initial users if empty
    const { rows } = await query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(rows[0].count) === 0) {
      const bcrypt = await import('bcryptjs');
      const HASH = await bcrypt.default.hash('vittalis123', 10);
      await query(`INSERT INTO usuarios (id,nome,email,senha,role,cor) VALUES
        ('u1','Miecio Costa','miecio@vittalissaude.com.br',$1,'master','#00B8C0'),
        ('u2','Nágila Santos','nagila@vittalissaude.com.br',$1,'atendente','#C4973B'),
        ('u3','Raquel Ferreira','raquel@vittalissaude.com.br',$1,'atendente','#8b5cf6'),
        ('u4','Thales Oliveira','thales@vittalissaude.com.br',$1,'atendente','#f97316')
        ON CONFLICT DO NOTHING`, [HASH]);

      await query(`INSERT INTO respostas_rapidas (titulo,texto) VALUES
        ('Boas-vindas','Olá! 👋 Seja bem-vindo(a) à *Vittalis Saúde* 💎 Como posso te ajudar?'),
        ('Horário','Atendemos seg-sáb 8h-18h. Dom e feriados 8h-12h 📅'),
        ('Solicitar valores','Qual vacina ou serviço você precisa? 💉'),
        ('Plano Vacinal','Temos planos vacinais completos para adultos e crianças! Posso enviar os detalhes? 📋'),
        ('Agendamento','Ótimo! Qual o melhor horário? (manhã ou tarde?) 📅'),
        ('Fechar','Muito obrigado(a) pelo contato! 🙏 Cuide-se!') ON CONFLICT DO NOTHING`);

      await query(`INSERT INTO configuracoes (chave,valor) VALUES ('bot','{"ativo":true,"mensagemBoasVindas":"Olá! 💎 Sou a assistente da Vittalis Saúde!\\n\\n1️⃣ Vacinas avulsas\\n2️⃣ Plano Vacinal\\n3️⃣ Consultas\\n4️⃣ Falar com atendente","respostas":{"1":"Um atendente enviará os valores! 💉","2":"Planos completos! Um atendente irá te ajudar! 👶","3":"Consultas especializadas 🩺","4":"Já chamo um atendente! 😊","default":"Vou chamar um atendente 😊"},"transferirApos":1}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Initial seed complete');
    }

    console.log('✅ Auto-migrate complete');
  } catch (err) {
    console.error('⚠️  Auto-migrate error (non-fatal):', err.message);
  }
}
