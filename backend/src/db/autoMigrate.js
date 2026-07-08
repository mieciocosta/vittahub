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
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf TEXT`).catch(() => {});
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_cpf ON usuarios(cpf) WHERE cpf IS NOT NULL`).catch(() => {});
    // Acesso multi-setor: lista de setores exatos que o usuário pode ver, além da
    // regra macro (ex.: Danielle vê vacinas E consultas). Vazio = regra normal.
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS setores TEXT[]`).catch(() => {});
    // Líder de equipe: ganha a tela de Planejamento (plano de crescimento/bônus).
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS lider BOOLEAN DEFAULT false`).catch(() => {});

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

    // ── Funil Kanban: colunas dinâmicas (título/cor/ordem editáveis) ──────────
    // "Fechado" e "Perdido" são fixas (fixa=true): relatórios dependem desses
    // nomes — podem mudar cor/ordem, mas não nome, e não podem ser excluídas.
    await query(`CREATE TABLE IF NOT EXISTS funil_colunas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nome TEXT UNIQUE NOT NULL,
      cor TEXT DEFAULT '#3b82f6',
      ordem INT DEFAULT 0,
      fixa BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});
    const { rows: fcCount } = await query('SELECT COUNT(*) FROM funil_colunas');
    if (parseInt(fcCount[0].count) === 0) {
      await query(`INSERT INTO funil_colunas (nome, cor, ordem, fixa) VALUES
        ('Novo lead','#3b82f6',0,false),
        ('Em atendimento','#f97316',1,false),
        ('Orçamento enviado','#8b5cf6',2,false),
        ('Aguardando retorno','#f59e0b',3,false),
        ('Fechado','#10b981',4,true),
        ('Perdido','#ef4444',5,true)
        ON CONFLICT DO NOTHING`);
      console.log('🌱 Funil: colunas padrão criadas');
    }

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
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'zapi'`).catch(() => {});
    // Follow-up automático: nutrição de leads que ficaram em silêncio
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS followup_count INT DEFAULT 0`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS followup_last_at TIMESTAMPTZ`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS followup_pausado BOOLEAN DEFAULT false`).catch(() => {});
    // Score de temperatura do lead (quente / morno / frio)
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS lead_score TEXT`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS lead_score_motivo TEXT`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS lead_score_at TIMESTAMPTZ`).catch(() => {});
    // Memória do lead: perfil persistente (paciente, idade, o que já cotou…)
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS memoria JSONB DEFAULT '{}'::jsonb`).catch(() => {});
    // WhatsApp LID: casa mensagens enviadas pelo celular (que chegam só com @lid)
    // com a conversa real criada pelas mensagens recebidas.
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS chat_lid TEXT`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_conv_chat_lid ON conversas(chat_lid) WHERE chat_lid IS NOT NULL`).catch(() => {});
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
    await query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS media_data TEXT`).catch(() => {}); // base64/url de midia enviada
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

    // ── SEED DE PRODUÇÃO (roda uma única vez — flag em configuracoes) ────────
    // Usuários reais: Miécio e Nágila (master), Danielle e Raylane (atendente).
    // Login por CPF, senha padrão Vittalis@2026. Demos são desativados.
    const { rows: [seedFlag] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_producao_v1'");
    if (!seedFlag) {
      const bcrypt = await import('bcryptjs');
      const HASH = await bcrypt.default.hash('Vittalis@2026', 10);
      const upsert = async (email, nome, role, cor, cpf) => {
        await query(`
          INSERT INTO usuarios (nome, email, senha, role, cor, cpf, ativo)
          VALUES ($1, $2, $3, $4, $5, $6, true)
          ON CONFLICT (email) DO UPDATE SET
            nome = EXCLUDED.nome, senha = EXCLUDED.senha, role = EXCLUDED.role,
            cor = EXCLUDED.cor, cpf = COALESCE(EXCLUDED.cpf, usuarios.cpf), ativo = true`,
          [nome, email, HASH, role, cor, cpf]);
      };
      await upsert('miecio@vittalissaude.com.br',   'Miécio Costa',   'master',    '#207898', '02914270305');
      await upsert('nagila@vittalissaude.com.br',   'Nágila Santos',  'master',    '#C4973B', '35411272874');
      await upsert('danielle@vittalissaude.com.br', 'Danielle Silva', 'atendente', '#8b5cf6', '61867382300');
      await upsert('raylane@vittalissaude.com.br',  'Raylane Moraes', 'atendente', '#00B8C0', '63358210367');
      // Desativa usuários de demonstração
      await query(`UPDATE usuarios SET ativo = false WHERE email IN ('raquel@vittalissaude.com.br','thales@vittalissaude.com.br')`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_producao_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Seed de produção aplicado (usuários reais, senha Vittalis@2026)');
    }

    // ── KILL-SWITCH (ordem da gestão): desliga TODOS os bots e o interruptor
    //    global. Roda UMA vez. Depois, só o master (Miécio/Nágila) religa em
    //    Configurações. Resolve os bots que "não desligavam".
    const { rows: [killFlag] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'bot_kill_v1'").catch(() => ({ rows: [] }));
    if (!killFlag) {
      await query('UPDATE conversas SET bot_ativo = false WHERE bot_ativo = true').catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('bot', '{"ativo":false}'::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor, '{}'::jsonb), '{ativo}', 'false'::jsonb), updated_at = NOW()`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('bot_kill_v1', '{"ok":true}'::jsonb) ON CONFLICT DO NOTHING`).catch(() => {});
      console.log('🔌 Kill-switch aplicado: todos os bots desligados + bot global OFF (uma vez)');
    }

    // ── SETORES E PAPÉIS (estrutura da equipe: admin / supervisora / atendente) ──
    await query(`ALTER TABLE usuarios  ADD COLUMN IF NOT EXISTS setor TEXT`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS setor TEXT`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS menu_enviado BOOLEAN DEFAULT false`).catch(() => {});
    await query(`ALTER TABLE leads     ADD COLUMN IF NOT EXISTS setor TEXT`).catch(() => {});

    const { rows: [flagSetores] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_setores_v1'");
    if (!flagSetores) {
      const bcrypt2 = await import('bcryptjs');
      const HASH2 = await bcrypt2.default.hash('Vittalis@2026', 10);
      // Supervisoras (e atendentes do setor de Vacinas)
      await query(`UPDATE usuarios SET role = 'supervisor', setor = 'vacinas' WHERE cpf IN ('61867382300','63358210367')`).catch(() => {});
      // Setor de Consultas: Fabiane (CPF do cadastro) e Taíse (CPF a cadastrar pelo master)
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor)
        VALUES (gen_random_uuid()::text, 'Fabiane Santos', 'fabiane@vittahub.local', '02607997348', $1, 'atendente', '#0fb07a', true, 'consultas')
        ON CONFLICT (email) DO NOTHING`, [HASH2]).catch(() => {});
      await query(`INSERT INTO usuarios (id, nome, email, senha, role, cor, ativo, setor)
        VALUES (gen_random_uuid()::text, 'Taíse', 'taise@vittahub.local', $1, 'atendente', '#7c5cbf', true, 'consultas')
        ON CONFLICT (email) DO NOTHING`, [HASH2]).catch(() => {});
      // Conversas antigas (pré-setores) são do negócio principal: vacinas.
      // Novas conversas nascem sem setor e recebem o menu de triagem.
      await query(`UPDATE conversas SET setor = 'vacinas' WHERE setor IS NULL`).catch(() => {});
      await query(`UPDATE conversas SET menu_enviado = true WHERE menu_enviado IS NOT true`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_setores_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Seed setores/papéis aplicado');
    }

    // ── Atualização de equipe (uma vez): Klycia entra (supervisora do não-vacina,
    // ou seja, consultas/terapias) e Fabiane sai (desativada). Senha padrão da casa.
    const { rows: [flagKF] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_equipe_klycia_v1'");
    if (!flagKF) {
      const bcryptK = await import('bcryptjs');
      const hashK = await bcryptK.default.hash('Vittalis@2026', 10);
      const { rows: existeK } = await query("SELECT id FROM usuarios WHERE cpf = '06100955369' LIMIT 1").catch(() => ({ rows: [] }));
      if (!existeK.length) {
        await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor)
          VALUES (gen_random_uuid()::text, 'Klycia', '06100955369@vittahub.local', '06100955369', $1, 'supervisor', '#e8671a', true, 'consultas')
          ON CONFLICT (email) DO NOTHING`, [hashK]).catch((e) => console.error('seed klycia insert:', e.message));
      }
      // Garante o papel/setor/ativo dela mesmo se já existia por outra via
      await query(`UPDATE usuarios SET role = 'supervisor', setor = 'consultas', ativo = true WHERE cpf = '06100955369'`).catch(() => {});
      // Retira a Fabiane do CRM (desativa — preserva histórico; pode reativar na tela)
      await query(`UPDATE usuarios SET ativo = false WHERE cpf = '02607997348' OR email = 'fabiane@vittahub.local'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_equipe_klycia_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Equipe: Klycia (supervisora/consultas) criada e Fabiane desativada');
    }

    // ── Reatribui as conversas da Fabiane para a Klycia (uma vez). Só roda se as
    // DUAS existem — evita "desatribuir" sem querer caso a Klycia ainda não exista.
    const { rows: [flagRA] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_reassign_fabiane_klycia_v1'");
    if (!flagRA) {
      const { rows: [kly] } = await query("SELECT id FROM usuarios WHERE cpf = '06100955369' LIMIT 1").catch(() => ({ rows: [] }));
      const { rows: [fab] } = await query("SELECT id FROM usuarios WHERE cpf = '02607997348' OR email = 'fabiane@vittahub.local' LIMIT 1").catch(() => ({ rows: [] }));
      if (kly && fab) {
        const r = await query('UPDATE conversas SET responsavel_id = $1 WHERE responsavel_id = $2', [kly.id, fab.id]).catch((e) => { console.error('reassign fabiane->klycia:', e.message); return null; });
        if (r) {
          await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_reassign_fabiane_klycia_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
          console.log(`🔁 ${r.rowCount} conversa(s) da Fabiane reatribuída(s) para a Klycia`);
        }
      }
    }

    // ── Desativa a Taíse (uma vez). O middleware de revogação corta o acesso na
    // hora; pode reativar pela tela quando quiser (flag impede re-rodar).
    const { rows: [flagTz] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_desativa_taise_v1'");
    if (!flagTz) {
      const r = await query(`UPDATE conversas SET responsavel_id = NULL WHERE responsavel_id IN (SELECT id FROM usuarios WHERE email = 'taise@vittahub.local' OR cpf = '62109563354')`).catch(() => null);
      const up = await query(`UPDATE usuarios SET ativo = false WHERE email = 'taise@vittahub.local' OR cpf = '62109563354'`).catch((e) => { console.error('desativa taise:', e.message); return null; });
      if (up) {
        await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_desativa_taise_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
        console.log(`🔒 Taíse desativada (${up.rowCount} usuário) e ${r?.rowCount || 0} conversa(s) liberadas`);
      }
    }

    // ── Cria a Giovanna (atendente de vacinas) — uma vez. Senha padrão da casa.
    const { rows: [flagGi] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_giovanna_v1'");
    if (!flagGi) {
      const bcryptG = await import('bcryptjs');
      const hashG = await bcryptG.default.hash('Vittalis@2026', 10);
      const { rows: existeG } = await query("SELECT id FROM usuarios WHERE cpf = '61313127370' LIMIT 1").catch(() => ({ rows: [] }));
      if (!existeG.length) {
        await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor)
          VALUES (gen_random_uuid()::text, 'Giovanna Pacheco Conceição', '61313127370@vittahub.local', '61313127370', $1, 'atendente', '#0ea5e9', true, 'vacinas')
          ON CONFLICT (email) DO NOTHING`, [hashG]).catch((e) => console.error('seed giovanna:', e.message));
      }
      await query(`UPDATE usuarios SET setor = 'vacinas', ativo = true WHERE cpf = '61313127370'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_giovanna_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Giovanna (atendente/vacinas) criada');
    }

    // ── Cria a GIOVANA (atendente de vacinas) — uma vez. Login pelo NOME: o auth
    // aceita e-mail no campo de login, então o e-mail dela é 'giovana' e ela
    // entra com "Giovana" / Vittalis@2026. CPF fica nulo.
    const { rows: [flagGv] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_giovana_consultas_v1'");
    if (!flagGv) {
      const bcryptV = await import('bcryptjs');
      const hashV = await bcryptV.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor)
        VALUES (gen_random_uuid()::text, 'Giovana', 'giovana', NULL, $1, 'atendente', '#0E8C96', true, 'vacinas')
        ON CONFLICT (email) DO UPDATE SET nome = 'Giovana', senha = EXCLUDED.senha, role = 'atendente', cor = '#0E8C96', ativo = true, setor = 'vacinas'`,
        [hashV]).catch((e) => console.error('seed giovana:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_giovana_consultas_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Giovana (atendente/vacinas) criada');
    }
    // Ajuste (pedido): Giovana fica em VACINAS. Corrige bancos onde ela já tinha
    // entrado como consultas e desfaz a herança de conversas de consultas.
    const { rows: [flagGvFix] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_giovana_vacinas_v1'");
    if (!flagGvFix) {
      await query(`UPDATE conversas SET responsavel_id = NULL WHERE responsavel_id = (SELECT id FROM usuarios WHERE email = 'giovana')`).catch(() => {});
      await query(`UPDATE usuarios SET setor = 'vacinas' WHERE email = 'giovana'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_giovana_vacinas_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🔧 Giovana movida para vacinas; conversas de consultas liberadas');
    }

    // ── Usuário MASTER TEMPORÁRIO: Ana (login por CPF) — uma vez. Pode ser
    // desativada depois pela tela de equipe quando não precisar mais.
    const { rows: [flagAna] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_master_ana_temp_v1'");
    if (!flagAna) {
      const bcA = await import('bcryptjs');
      const hashA = await bcA.default.hash('AnaMaster@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor)
        VALUES (gen_random_uuid()::text, 'Ana', 'ana', '11144477735', $1, 'master', '#e8671a', true, NULL)
        ON CONFLICT (email) DO UPDATE SET nome = 'Ana', senha = EXCLUDED.senha, role = 'master', ativo = true`,
        [hashA]).catch((e) => console.error('seed ana:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_master_ana_temp_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🪪 Master temporário Ana criado');
    }
    // CPF da Ana (login por CPF) — corrige bancos onde ela entrou sem CPF.
    const { rows: [flagAnaCpf] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_master_ana_cpf_v1'");
    if (!flagAnaCpf) {
      await query(`UPDATE usuarios SET cpf = '11144477735' WHERE email = 'ana' AND (cpf IS NULL OR cpf = '')`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_master_ana_cpf_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    // Metas de vendas do mês por setor (pedido do master). Uma vez — depois o
    // master ajusta pela tela de Metas quando quiser.
    const { rows: [flagMetas] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_metas_vendas_v1'");
    if (!flagMetas) {
      await query(`INSERT INTO configuracoes (chave, valor)
        VALUES ('metas', jsonb_build_object('vendas', jsonb_build_object('vacinas', 250000, 'consultas', 259000, 'terapias', 250000)))
        ON CONFLICT (chave) DO UPDATE SET
          valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{vendas}',
                            jsonb_build_object('vacinas',250000,'consultas',259000,'terapias',250000), true),
          updated_at = NOW()`).catch((e) => console.error('seed metas:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_metas_vendas_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🎯 Metas de vendas: vacinas 250k, consultas 259k, terapias 250k');
    }

    // Raylane: líder de equipe (ganha a tela de Planejamento). Uma vez.
    const { rows: [flagRayLid] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_raylane_lider_v1'");
    if (!flagRayLid) {
      await query(`UPDATE usuarios SET lider = true WHERE email = 'raylane@vittalissaude.com.br' OR cpf = '63358210367'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_raylane_lider_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('👑 Raylane: líder de equipe (Planejamento)');
    }

    // Danielle: acesso a vacinas E consultas (só ela). Deixa a conta redonda.
    const { rows: [flagDani] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_danielle_multisetor_v2'");
    if (!flagDani) {
      await query(`UPDATE usuarios SET setores = '{vacinas,consultas}', setor = COALESCE(setor,'vacinas'), ativo = true
                   WHERE email = 'danielle@vittalissaude.com.br' OR cpf = '61867382300'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_danielle_multisetor_v2', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🔓 Danielle: vacinas + consultas (conta completa)');
    }

    // ── AUDITORIA + PRESENÇA (admin only) ─────────────────────────────────
    await query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY, usuario_id TEXT, usuario_nome TEXT, acao TEXT NOT NULL,
      entidade TEXT, entidade_id TEXT, detalhes JSONB, ip TEXT, user_agent TEXT,
      latitude NUMERIC(10,7), longitude NUMERIC(10,7), created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_user_date ON audit_logs (usuario_id, created_at DESC)`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS presenca (
      usuario_id TEXT PRIMARY KEY, socket_id TEXT, status TEXT DEFAULT 'online',
      ultimo_heartbeat TIMESTAMPTZ DEFAULT NOW(), latitude NUMERIC(10,7), longitude NUMERIC(10,7),
      user_agent TEXT, ip TEXT, pagina TEXT
    )`).catch(() => {});

    // ── TRIAGEM: menu de boas-vindas reaparece após 24h de conversa parada ──
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS triagem_data DATE`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS triagem_ts TIMESTAMPTZ`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS captura_etapa TEXT`).catch(() => {});
    // Proteção do deploy: só atendimento ATIVO (equipe respondeu nas últimas 24h)
    // fica protegido do menu; cliente falando sozinho recebe boas-vindas normalmente
    await query(`UPDATE conversas SET triagem_ts = NOW()
                 WHERE triagem_ts IS NULL AND id IN (
                   SELECT DISTINCT conversa_id FROM mensagens
                   WHERE from_type = 'me' AND created_at > NOW() - interval '24 hours')`).catch(() => {});

    // ── FICHA DO PACIENTE (dados do cliente no painel da conversa) ──────────
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS nascimento DATE`).catch(() => {});
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS endereco TEXT`).catch(() => {});
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS bairro TEXT`).catch(() => {});
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS responsavel_cliente TEXT`).catch(() => {});

    // ── FERRAMENTAS: Agenda, Indicações, Biblioteca, Ligações ───────────────
    await query(`CREATE TABLE IF NOT EXISTS agenda_eventos (
      id SERIAL PRIMARY KEY, paciente TEXT NOT NULL, responsavel_nome TEXT,
      servico TEXT, data DATE NOT NULL, hora TEXT NOT NULL, profissional TEXT,
      telefone TEXT, observacoes TEXT, status TEXT DEFAULT 'Agendado',
      setor TEXT DEFAULT 'vacinas', responsavel_id TEXT, lead_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_agenda_data ON agenda_eventos (data)`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS endereco TEXT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS local_link TEXT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS email TEXT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2)`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS forma_pagamento TEXT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS parcelas INT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS conversa_id TEXT`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_agenda_conversa ON agenda_eventos (conversa_id)`).catch(() => {});
    // CURSOS / treinamento da equipe (links, vídeos, materiais).
    await query(`CREATE TABLE IF NOT EXISTS cursos (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      titulo TEXT NOT NULL, descricao TEXT, url TEXT, categoria TEXT DEFAULT 'Geral',
      criado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS arquivo TEXT`).catch(() => {});   // data URL (PDF/vídeo/imagem)
    await query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS filename TEXT`).catch(() => {});
    await query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS mimetype TEXT`).catch(() => {});
    // Painel de Profissionais: cadastro de médicos/especialistas + disponibilidade
    await query(`CREATE TABLE IF NOT EXISTS profissionais (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nome TEXT NOT NULL, especialidade TEXT, setor TEXT DEFAULT 'consultas',
      cor TEXT DEFAULT '#00B8C0', telefone TEXT, ativo BOOLEAN DEFAULT true,
      disponibilidade JSONB DEFAULT '{}'::jsonb, observacoes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    // Foto do profissional + documentos complementares (diploma etc.)
    await query(`ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS foto TEXT`).catch(() => {});
    await query(`ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS documentos JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    // VENDAS: espinha comercial — alimenta metas, dashboard e relatórios.
    // lead_id é TEXT porque os ids de lead/conversa são UUID (não inteiro).
    await query(`CREATE TABLE IF NOT EXISTS vendas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversa_id TEXT, lead_id TEXT,
      atendente_id TEXT, atendente_nome TEXT,
      setor TEXT, categoria TEXT,
      cliente_nome TEXT, paciente_nome TEXT, servico TEXT,
      valor NUMERIC(10,2) DEFAULT 0,
      forma_pagamento TEXT, status_pagamento TEXT DEFAULT 'pago',
      data_venda DATE DEFAULT CURRENT_DATE, data_atendimento DATE,
      origem TEXT, observacao TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas (data_venda)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_vendas_setor ON vendas (setor)`).catch(() => {});
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) DEFAULT 0`).catch(() => {});
    // CAIXA: comprovante de pagamento anexado à venda (data URL base64 — imagem ou PDF)
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS comprovante TEXT`).catch(() => {});
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS comprovante_nome TEXT`).catch(() => {});
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS comprovante_tipo TEXT`).catch(() => {});
    // CAIXA: conciliação — marcar venda como conferida pelo financeiro
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS conferido BOOLEAN DEFAULT false`).catch(() => {});
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS conferido_em TIMESTAMPTZ`).catch(() => {});
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS conferido_por TEXT`).catch(() => {});
    // CAIXA: valor de repasse (ex.: pago à vacinadora/profissional) + análise IA do comprovante
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS repasse NUMERIC(10,2) DEFAULT 0`).catch(() => {});
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS comprovante_analise JSONB`).catch(() => {});
    // PLANEJAMENTO: estratégias, blocos de notas e lembretes do líder/gestão (pessoal)
    await query(`CREATE TABLE IF NOT EXISTS planejamento_notas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      usuario_id TEXT,
      tipo TEXT DEFAULT 'nota',
      titulo TEXT,
      conteudo TEXT,
      lembrete_em DATE,
      concluido BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_plannotas_user ON planejamento_notas (usuario_id)`).catch(() => {});
    // PERDAS: lead marcado como perdido (motivo obrigatório) — alimenta relatórios.
    await query(`CREATE TABLE IF NOT EXISTS perdas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversa_id TEXT, atendente_id TEXT, atendente_nome TEXT,
      setor TEXT, categoria TEXT, cliente_nome TEXT,
      motivo TEXT NOT NULL, observacao TEXT, valor_potencial NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS perdido BOOLEAN DEFAULT false`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS motivo_perda TEXT`).catch(() => {});
    // ANÁLISE DE QUALIDADE DO ATENDIMENTO por IA (nota 0-100 por atendimento).
    await query(`CREATE TABLE IF NOT EXISTS analises_atendimento (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversa_id TEXT, atendente_id TEXT, atendente_nome TEXT, cliente_nome TEXT,
      score INT, criterios JSONB DEFAULT '{}'::jsonb,
      pontos_fortes TEXT, pontos_fracos TEXT, resumo TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_analises_atend ON analises_atendimento (atendente_id)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_analises_conv ON analises_atendimento (conversa_id, created_at DESC)`).catch(() => {});
    // FUNIL DENTRO DA PASTA: cada pasta (Planos/Fidelidade/Consultas/etc.) tem o
    // seu funil de etapas pra empurrar o lead até fechar a venda.
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS funil_etapa TEXT`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS pasta_etapas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      contexto TEXT NOT NULL,            -- a pasta: planos_vacinais, fidelidade, consultas, terapias, vacinacao, banco_dados
      nome TEXT NOT NULL, cor TEXT DEFAULT '#3b82f6',
      ordem INT DEFAULT 0, fixa BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`ALTER TABLE pasta_etapas ADD COLUMN IF NOT EXISTS tipo TEXT`).catch(() => {}); // 'ganho' | 'perdido' | null
    await query(`ALTER TABLE pasta_etapas ADD COLUMN IF NOT EXISTS descricao TEXT`).catch(() => {}); // passo a passo da etapa
    await query(`CREATE INDEX IF NOT EXISTS idx_pasta_etapas_ctx ON pasta_etapas (contexto, ordem)`).catch(() => {});
    // Backfill do tipo nas etapas padrão já semeadas antes desta coluna existir.
    await query(`UPDATE pasta_etapas SET tipo = 'ganho' WHERE nome = 'Ganho' AND tipo IS NULL`).catch(() => {});
    await query(`UPDATE pasta_etapas SET tipo = 'perdido' WHERE nome = 'Perdido' AND tipo IS NULL`).catch(() => {});
    // CHAT INTERNO da equipe (usuário ↔ usuário, separado do WhatsApp).
    await query(`CREATE TABLE IF NOT EXISTS chat_interno (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      de_id TEXT NOT NULL, de_nome TEXT, para_id TEXT NOT NULL,
      conteudo TEXT NOT NULL, lida BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_chatint_par ON chat_interno (de_id, para_id, created_at)`).catch(() => {});
    // Chat da equipe com mídia: áudio (gravado no navegador) e documentos/imagens.
    await query(`ALTER TABLE chat_interno ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'text'`).catch(() => {});
    await query(`ALTER TABLE chat_interno ADD COLUMN IF NOT EXISTS arquivo TEXT`).catch(() => {}); // data URL base64
    await query(`ALTER TABLE chat_interno ADD COLUMN IF NOT EXISTS filename TEXT`).catch(() => {});
    await query(`ALTER TABLE chat_interno ADD COLUMN IF NOT EXISTS mimetype TEXT`).catch(() => {});
    await query(`ALTER TABLE chat_interno ALTER COLUMN conteudo DROP NOT NULL`).catch(() => {});
    // Corrige tabelas já criadas com lead_id INT (UUID não cabe em inteiro)
    await query(`ALTER TABLE vendas ALTER COLUMN lead_id TYPE TEXT USING lead_id::text`).catch(() => {});
    await query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS editada BOOLEAN DEFAULT false`).catch(() => {});
    // Pastas de organização: 'fidelidade' (mensalistas) e 'banco_dados' (1 vacina só)
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS categoria TEXT`).catch(() => {});
    // Classificação fina feita pelo atendente (vacinacao/planos_vacinais/fidelidade/
    // consultas/terapias) — rótulo; o acesso continua sendo por setor (vacina x não).
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS classificacao TEXT`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_conversas_categoria ON conversas (categoria) WHERE categoria IS NOT NULL`).catch(() => {});
    // Organização por mês das pastas: quando entrou na pasta (mês de referência)
    // e o dia do mês que o mensalista costuma vacinar (Fidelidade).
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS categoria_em TIMESTAMPTZ`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS pasta_dia INT`).catch(() => {});
    // Backfill: quem já está numa pasta e ainda não tem data de referência herda o último contato.
    await query(`UPDATE conversas SET categoria_em = COALESCE(last_message_at, created_at, NOW()) WHERE categoria IS NOT NULL AND categoria_em IS NULL`).catch(() => {});
    // Exemplos de conversas que converteram — a IA estuda pra copiar o jeito campeão
    await query(`CREATE TABLE IF NOT EXISTS exemplos_conversa (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      titulo TEXT, setor TEXT DEFAULT 'consultas', conteudo TEXT NOT NULL,
      criado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});

    await query(`CREATE TABLE IF NOT EXISTS indicacoes (
      id SERIAL PRIMARY KEY, indicador_nome TEXT NOT NULL, indicador_telefone TEXT,
      indicado_nome TEXT NOT NULL, indicado_telefone TEXT,
      status TEXT DEFAULT 'Cadastrada', tipo_conversao TEXT, pontos INT DEFAULT 0,
      premio TEXT, premio_entregue BOOLEAN DEFAULT false, observacoes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});

    await query(`CREATE TABLE IF NOT EXISTS biblioteca_midias (
      id SERIAL PRIMARY KEY, titulo TEXT NOT NULL, tipo TEXT NOT NULL,
      setor TEXT DEFAULT 'geral', categoria TEXT, mime TEXT, data TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});

    await query(`CREATE TABLE IF NOT EXISTS ligacoes (
      id SERIAL PRIMARY KEY, contato_nome TEXT NOT NULL, telefone TEXT NOT NULL,
      usuario_id TEXT, direcao TEXT DEFAULT 'realizada', status TEXT DEFAULT 'Atendida',
      duracao_min INT DEFAULT 0, observacoes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});

    // ── FUNIS POR SETOR (etapas próprias p/ Vacinas, Consultas e Terapias) ──
    await query(`ALTER TABLE funil_colunas ADD COLUMN IF NOT EXISTS setor TEXT DEFAULT 'vacinas'`).catch(() => {});
    const FUNIS = {
      vacinas:   [['Novo Lead','#00B8C0'],['Em Atendimento','#0E8C96'],['Orçamento Enviado','#C4973B'],['Negociação','#e8671a'],['Venda Fechada','#0fb07a'],['Agendado','#3b82f6'],['Vacinado','#7c5cbf'],['Pós-Vacinal','#ec4899'],['Reagendamento Futuro','#64748b']],
      consultas: [['Novo Lead','#00B8C0'],['Em Atendimento','#0E8C96'],['Agendamento Pendente','#C4973B'],['Agendado','#3b82f6'],['Consulta Confirmada','#e8671a'],['Consulta Realizada','#0fb07a'],['Retorno','#7c5cbf'],['Finalizado','#64748b']],
      terapias:  [['Novo Lead','#00B8C0'],['Triagem','#0E8C96'],['Avaliação','#C4973B'],['Plano Terapêutico','#e8671a'],['Em Tratamento','#3b82f6'],['Renovação','#7c5cbf'],['Finalizado','#0fb07a']],
    };
    const seedFunilSetor = async (setorF, etapas) => {
      let ordem = 0;
      for (const [nome, cor] of etapas) {
        await query(`INSERT INTO funil_colunas (nome, cor, ordem, fixa, setor)
          SELECT $1, $2, $3, false, $4
          WHERE NOT EXISTS (SELECT 1 FROM funil_colunas WHERE nome = $1 AND setor = $4)`,
          [nome, cor, ordem++, setorF]).catch(() => {});
      }
      // Perdido sempre existe em todo setor (motivo de perda obrigatório)
      await query(`INSERT INTO funil_colunas (nome, cor, ordem, fixa, setor)
        SELECT 'Perdido', '#e84040', 99, true, $1
        WHERE NOT EXISTS (SELECT 1 FROM funil_colunas WHERE nome = 'Perdido' AND setor = $1)`, [setorF]).catch(() => {});
    };
    const { rows: [flagFunis] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_funis_v1'");
    if (!flagFunis) {
      await query(`UPDATE funil_colunas SET setor = 'vacinas' WHERE setor IS NULL`).catch(() => {});
      await query(`UPDATE leads SET setor = 'vacinas' WHERE setor IS NULL`).catch(() => {});
      for (const [setorF, etapas] of Object.entries(FUNIS)) await seedFunilSetor(setorF, etapas);
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_funis_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Funis por setor criados');
    }
    // Rede de segurança: nenhum setor pode ficar SEM etapas (senão o quadro fica
    // vazio ao filtrar). Só semeia quando o setor está zerado — não ressuscita
    // colunas que o master renomeou/apagou.
    for (const [setorF, etapas] of Object.entries(FUNIS)) {
      const { rows: [c] } = await query("SELECT COUNT(*)::int n FROM funil_colunas WHERE COALESCE(setor,'vacinas') = $1", [setorF]).catch(() => ({ rows: [{ n: 1 }] }));
      if (parseInt(c?.n) === 0) await seedFunilSetor(setorF, etapas);
    }
    // RESET (uma vez): o funil tinha colunas legadas/genéricas misturadas (ex.:
    // "2 meses"), então os títulos não batiam com o setor. Zera e recria o padrão
    // correto de cada setor. (leads.status é texto livre, sem FK — seguro.) E move
    // pacientes que estavam numa etapa inexistente para uma etapa válida do setor,
    // pra não sumirem do quadro. Depois o master pode renomear/adicionar etapas.
    const { rows: [flagFr] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_funis_reset_v3'");
    if (!flagFr) {
      await query('DELETE FROM funil_colunas').catch(() => {});
      for (const [setorF, etapas] of Object.entries(FUNIS)) await seedFunilSetor(setorF, etapas);
      // Leads órfãos (status que não é mais etapa do setor) → etapa válida
      for (const [setorF, etapas] of Object.entries(FUNIS)) {
        const nomes = etapas.map(e => e[0]).concat(['Perdido']);
        const destino = setorF === 'terapias' ? 'Triagem' : 'Em Atendimento';
        await query(`UPDATE leads SET status = $1 WHERE COALESCE(setor,'vacinas') = $2 AND status <> ALL($3::text[])`,
          [destino, setorF, nomes]).catch(() => {});
      }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_funis_reset_v3','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🔄 Funil resetado por setor + pacientes órfãos realocados');
    }

    // ── KIT DE MENSAGENS PRONTAS (espec. da gestão) ──────────────────────────
    const { rows: [flagQR2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_qr_v2'");
    if (!flagQR2) {
      const KIT = [
        ['Solicitar endereço', 'Pra eu organizar tudo certinho: pode me passar seu endereço completo com bairro, por gentileza? 😊'],
        ['Solicitar documentos', 'Perfeito! Pra finalizar, me envia por aqui uma foto do documento do responsável e o cartão de vacinação, por favor 📄'],
        ['Confirmar agendamento', 'Prontinho! Seu horário está confirmado 🗓️ Qualquer imprevisto é só me avisar por aqui que a gente reorganiza, combinado?'],
        ['Confirmar pagamento', 'Recebido! Pagamento confirmado ✅ Muito obrigada pela confiança — vamos cuidar de tudo com muito carinho 💙'],
        ['Enviar orçamento', 'Preparei seu orçamento com todo cuidado — vou te enviar agora em PDF. Qualquer dúvida sobre valores ou formas de pagamento, estou por aqui! 📋'],
        ['Pós-vacinal', 'Oi! Passando pra saber como está o(a) pequeno(a) depois da vacina de ontem 💙 Teve febre ou alguma reação? Estamos por aqui pra qualquer orientação.'],
        ['Reagendamento', 'Sem problema nenhum! Vamos achar um novo horário que fique melhor pra você. Prefere de manhã ou à tarde? 😊'],
        ['Cliente sem resposta', 'Oi! Tudo bem por aí? Ficou alguma dúvida que eu possa esclarecer? Sigo à disposição pra te ajudar no que precisar 💙'],
        ['Cliente achou caro', 'Eu entendo perfeitamente! E é justamente por isso que temos condições especiais: parcelamento sem juros e pacotes com desconto. Posso montar uma condição que caiba no seu momento? 😊'],
        ['Cliente pediu para pensar', 'Claro, decisão importante merece calma! Vou deixar sua proposta garantida por alguns dias. Posso te chamar daqui a 2 dias pra saber se ficou alguma dúvida?'],
      ];
      for (const [titulo, texto] of KIT) {
        await query(`INSERT INTO respostas_rapidas (titulo, texto)
          SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM respostas_rapidas WHERE titulo = $1)`,
          [titulo, texto]).catch(() => {});
      }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_qr_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    // ── Avatar de perfil (foto pequena em data URL) ──────────────────────────
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar TEXT`).catch(() => {});

    // ── Busca e fila de atendimento ───────────────────────────────────────────
    // last_from: quem mandou a última mensagem (filtro "Aguardando resposta")
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS last_from TEXT`).catch(() => {});
    // backfill único: deduz da última mensagem existente
    await query(`UPDATE conversas c SET last_from = sub.from_type
      FROM (SELECT DISTINCT ON (conversa_id) conversa_id, from_type
            FROM mensagens ORDER BY conversa_id, created_at DESC) sub
      WHERE sub.conversa_id = c.id AND c.last_from IS NULL`).catch(() => {});
    // Índices trigram: busca por trecho de mensagem e por nome de documento
    await query(`CREATE INDEX IF NOT EXISTS idx_msg_content_trgm ON mensagens USING gin (content gin_trgm_ops)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_msg_filename_trgm ON mensagens USING gin (filename gin_trgm_ops)`).catch(() => {});

    // ── Textos humanizados do bot e respostas rápidas (idempotente: só troca
    //    quem ainda está com o texto padrão antigo — edições da equipe ficam) ──
    await query(`UPDATE configuracoes
      SET valor = jsonb_set(valor, '{mensagemBoasVindas}',
        to_jsonb('Olá! Que alegria ter você por aqui 💙 Sou a Vitta, assistente da Vittalis Saúde. Me conta: é vacina, plano vacinal ou consulta? Pode falar à vontade que eu te ajudo!'::text))
      WHERE chave = 'bot' AND valor->>'mensagemBoasVindas' LIKE 'Olá! 💎 Sou a assistente%'`).catch(() => {});
    const qrFix = [
      ['Boas-vindas', 'Olá! 👋 Seja bem-vindo(a) à *Vittalis Saúde* 💎 Como posso te ajudar?',
        'Oi! Que bom falar com você 😊 Aqui é da Vittalis Saúde. Como posso te ajudar hoje?'],
      ['Horário', 'Atendemos seg-sáb 8h-18h. Dom e feriados 8h-12h 📅',
        'Nosso atendimento é de segunda a sábado, das 8h às 18h, e aos domingos e feriados das 8h às 12h. Quer que eu já verifique um horário pra você?'],
      ['Solicitar valores', 'Qual vacina ou serviço você precisa? 💉',
        'Claro! Me conta qual vacina ou serviço você procura, e se é para adulto ou criança, que eu te passo os valores certinhos 😊'],
      ['Plano Vacinal', 'Temos planos vacinais completos para adultos e crianças! Posso enviar os detalhes? 📋',
        'Temos planos vacinais completos que acompanham cada fase do bebê, com vários benefícios exclusivos. Quer que eu envie o plano ideal para a idade dele(a)?'],
      ['Agendamento', 'Ótimo! Qual o melhor horário? (manhã ou tarde?) 📅',
        'Perfeito! Você prefere de manhã ou à tarde? Vou verificar as melhores opções de horário pra você 😊'],
      ['Fechar', 'Muito obrigado(a) pelo contato! 🙏 Cuide-se!',
        'Foi um prazer falar com você! Qualquer coisa estamos por aqui. Cuide-se! 💙'],
    ];
    for (const [titulo, antigo, novo] of qrFix) {
      await query('UPDATE respostas_rapidas SET texto = $1 WHERE titulo = $2 AND texto = $3', [novo, titulo, antigo]).catch(() => {});
    }

    // ── CPFs dos masters (idempotente — corrige bancos onde o seed v1 já rodou) ──
    await query(`UPDATE usuarios SET cpf = '02914270305' WHERE email = 'miecio@vittalissaude.com.br' AND cpf IS DISTINCT FROM '02914270305'`).catch(() => {});
    await query(`UPDATE usuarios SET cpf = '35411272874' WHERE email = 'nagila@vittalissaude.com.br' AND cpf IS DISTINCT FROM '35411272874'`).catch(() => {});

    // ── Leads herdam a CARTEIRA (responsável) e o SETOR da conversa vinculada ──
    const { rows: [flagLC] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_leads_carteira_v1'");
    if (!flagLC) {
      await query(`UPDATE leads l SET
          responsavel_id = COALESCE(l.responsavel_id, sub.responsavel_id),
          setor = COALESCE(l.setor, sub.setor)
        FROM (SELECT DISTINCT ON (lead_id) lead_id, responsavel_id, setor FROM conversas
              WHERE lead_id IS NOT NULL ORDER BY lead_id, last_message_at DESC) sub
        WHERE sub.lead_id = l.id AND (l.responsavel_id IS NULL OR l.setor IS NULL)`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_leads_carteira_v1','{"ok":true}') ON CONFLICT DO NOTHING`).catch(() => {});
      console.log('🔗 Leads herdaram carteira/setor das conversas');
    }

    // ── Títulos (Dr/Dra) nos nomes dos masters — uma vez ──
    const { rows: [flagTit] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_titulos_dr_v1'");
    if (!flagTit) {
      await query(`UPDATE usuarios SET nome = 'Dr Miécio' WHERE email = 'miecio@vittalissaude.com.br'`).catch(() => {});
      await query(`UPDATE usuarios SET nome = 'Dra. Nágila' WHERE email = 'nagila@vittalissaude.com.br'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_titulos_dr_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🪪 Nomes atualizados: Dr Miécio e Dra. Nágila');
    }

    console.log('✅ Auto-migrate complete');
  } catch (err) {
    console.error('⚠️  Auto-migrate error (non-fatal):', err.message);
  }
}
