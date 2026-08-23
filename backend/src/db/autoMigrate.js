import { query } from './pool.js';

// Runs idempotent CREATE TABLE IF NOT EXISTS on startup
export default async function runMigrate() {
  try {
    await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await query(`CREATE EXTENSION IF NOT EXISTS unaccent`).catch(() => {});

    // ⚠️ configuracoes PRIMEIRO: seeds logo abaixo consultam esta tabela como
    // flag de "já rodou". Num banco NOVO ela só nascia na linha ~275 — a
    // consulta estourava e o migrate inteiro abortava no meio (descoberto ao
    // subir um banco zerado em 14/08/2026). Em produção nunca doeu porque a
    // tabela existe desde a v1. O CREATE lá de baixo continua, inofensivo.
    await query(`CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY, valor JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

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
    /* 🏠 HOME OFFICE POR PRODUÇÃO (pedido do master): quem tem so_carteira=true
       enxerga APENAS as conversas/leads TRANSFERIDOS pra ela — nem o pool de
       leads novos sem dono ela vê. A gestão passa o lead; ela trabalha. */
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS so_carteira BOOLEAN DEFAULT false`).catch(() => {});
    // Líder de equipe: ganha a tela de Planejamento (plano de crescimento/bônus).
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS lider BOOLEAN DEFAULT false`).catch(() => {});
    // Vínculo de liderança: quem é o líder deste usuário (Planejamento → liderados).
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS lider_id TEXT`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_lider ON usuarios (lider_id)`).catch(() => {});
    // Meta individual mensal (R$) do liderado — cobrança de meta pessoal.
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS meta_mensal NUMERIC(10,2) DEFAULT 0`).catch(() => {});
    // Acesso total: vê TODAS as conversas e leads, sem trava de setor (ex.: Danielle).
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ve_tudo BOOLEAN DEFAULT false`).catch(() => {});
    /* Permissão de ENTRAR COMO outro usuário, controlada pelo master na tela.
       Antes a lista de quem podia era fixa no código — se a conta do dono
       mudasse de nome, ninguém mais conseguia e só um deploy resolvia. */
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_impersonar BOOLEAN DEFAULT false`).catch(() => {});
    // O dono já nasce com a permissão (identificado pelo CPF, que não muda)
    await query(`UPDATE usuarios SET pode_impersonar = true
                  WHERE regexp_replace(COALESCE(cpf,''),'\\D','','g') = '02914270305'
                    AND COALESCE(pode_impersonar,false) = false`).catch(() => {});
    /* Conta "Maria" (a segunda master) — o master usa esta conta no dia a dia e
       pediu a troca de usuário nela. Roda UMA vez: se ele revogar depois pela
       tela, o seed não devolve a permissão por cima. */
    const { rows: [flagMariaImp] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_maria_impersonar_v1'");
    if (!flagMariaImp) {
      await query(`UPDATE usuarios SET pode_impersonar = true
                    WHERE email = 'nagila@vittalissaude.com.br'
                       OR regexp_replace(COALESCE(cpf,''),'\\D','','g') = '35411272874'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_maria_impersonar_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('👤 Conta Maria: liberada para entrar como outro usuário');
    }
    // MEU PAINEL: mural pessoal — notas, tarefas e documentos (por usuário).
    await query(`CREATE TABLE IF NOT EXISTS painel_itens (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      usuario_id TEXT NOT NULL, tipo TEXT DEFAULT 'nota',
      titulo TEXT, conteudo TEXT, arquivo TEXT, filename TEXT, mimetype TEXT,
      concluido BOOLEAN DEFAULT false, ordem INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_painel_user ON painel_itens (usuario_id)`).catch(() => {});
    // Painel: item tipo 'cliente' aponta pra uma conversa/atendimento (com nota própria)
    await query(`ALTER TABLE painel_itens ADD COLUMN IF NOT EXISTS ref_id TEXT`).catch(() => {});
    await query(`ALTER TABLE painel_itens ADD COLUMN IF NOT EXISTS telefone TEXT`).catch(() => {});

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
    // Marca conversas cujo histórico do Z-API já foi preservado no nosso banco
    // (para não perder mensagens antigas quando o Z-API as descartar).
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS historico_zapi BOOLEAN DEFAULT false`).catch(() => {});
    // Meta INDIVIDUAL de vendas por usuário (R$/mês) — 0 = sem meta individual
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS meta_individual NUMERIC(12,2) DEFAULT 0`).catch(() => {});
    /* Meta individual em DUAS unidades (pedido do master): algumas pessoas são
       cobradas em R$ no mês, outras em QUANTIDADE de consultas por dia. Misturar
       as duas num campo só faria "10" virar dez reais. */
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS meta_tipo TEXT DEFAULT 'valor'`).catch(() => {});
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS meta_qtd_dia INT DEFAULT 0`).catch(() => {});
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS meta_dias_uteis INT DEFAULT 26`).catch(() => {});
    // LIMPEZA (one-time, idempotente): conversas fantasma criadas pelo sync com
    // identificador @lid como nome, e eventos de ligação gravados como texto cru.
    await query(`UPDATE conversas SET contact_name = COALESCE(NULLIF(regexp_replace(phone, '\\D', '', 'g'), ''), 'Contato')
                 WHERE contact_name LIKE '%@lid%'`).catch(() => {});
    await query(`UPDATE mensagens SET content = '📞 Ligação recebida' WHERE content = 'CALL_RECEIVED'`).catch(() => {});
    await query(`UPDATE mensagens SET content = '📞 Ligação perdida' WHERE content IN ('CALL_MISSED','CALL_REJECTED')`).catch(() => {});
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
    // Mensagens rápidas personalizadas: usuario_id = dono (NULL = global da gestão)
    await query(`ALTER TABLE respostas_rapidas ADD COLUMN IF NOT EXISTS usuario_id TEXT`).catch(() => {});

    await query(`CREATE TABLE IF NOT EXISTS notificacoes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tipo TEXT, titulo TEXT, texto TEXT, lead_id TEXT, conv_id TEXT,
      lida BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`CREATE INDEX IF NOT EXISTS idx_notif_lida ON notificacoes(lida) WHERE lida = false`);
    // Alertas de segurança reservados ao master (ex.: varredura de contatos)
    await query(`ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS apenas_master BOOLEAN DEFAULT false`).catch(() => {});
    // Transcrição de áudios (Whisper) — texto pesquisável embaixo do player
    await query(`ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS transcricao TEXT`).catch(() => {});
    // Famílias com vários filhos (texto livre: "João (03/2026), Ana (2023)")
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS filhos TEXT`).catch(() => {});
    // 🔔 Push real (app fechado): inscrições dos aparelhos da equipe
    await query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, p256dh TEXT NOT NULL,
      auth TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (usuario_id)`).catch(() => {});
    // 📋 Raio-X da conversa (resumo + avaliação da IA), com cache por conversa
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resumo_ia JSONB`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resumo_ia_at TIMESTAMPTZ`).catch(() => {});
    // 📇 Ficha do cliente preenchida automaticamente pela conversa
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS cpf TEXT`).catch(() => {});
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS responsavel_cpf TEXT`).catch(() => {});
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS cep TEXT`).catch(() => {});
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ficha_em TIMESTAMPTZ`).catch(() => {});
    // 📞 Marca se houve LIGAÇÃO pro cliente antes de fechar a venda
    await query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS ligou BOOLEAN DEFAULT false`).catch(() => {});
    // 💉 Solicitação de vacinas CONFORME A AGENDA (separar/pedir o que será aplicado)
    await query(`CREATE TABLE IF NOT EXISTS solicitacoes_vacinas (
      id SERIAL PRIMARY KEY, agenda_id INT, conversa_id TEXT, lead_id TEXT,
      paciente TEXT NOT NULL, vacina TEXT NOT NULL, quantidade INT DEFAULT 1,
      data_prevista DATE, hora TEXT, setor TEXT DEFAULT 'vacinas',
      status TEXT DEFAULT 'solicitada', urgente BOOLEAN DEFAULT false, observacao TEXT,
      solicitante_id TEXT, solicitante_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_solvac_data ON solicitacoes_vacinas (data_prevista, status)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_solvac_agenda ON solicitacoes_vacinas (agenda_id)`).catch(() => {});
    // ⭐ Controle MENSAL da pasta Fidelidade (check por cliente/mês)
    await query(`CREATE TABLE IF NOT EXISTS fidelidade_checks (
      conversa_id TEXT NOT NULL, mes TEXT NOT NULL, feito BOOLEAN DEFAULT true,
      observacao TEXT, feito_por_id TEXT, feito_por_nome TEXT,
      feito_em TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (conversa_id, mes))`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_fidcheck_mes ON fidelidade_checks (mes)`).catch(() => {});
    /* 📝 BLOCO DE NOTAS DO CLIENTE (pedido do master): tudo que se descobre numa
       ligação fica registrado no perfil dele, com autor e data. É histórico, não
       um campo único que a próxima pessoa apaga ao editar. */
    await query(`CREATE TABLE IF NOT EXISTS cliente_notas (
      id SERIAL PRIMARY KEY, conversa_id TEXT, lead_id TEXT,
      texto TEXT NOT NULL, tipo TEXT DEFAULT 'nota',
      autor_id TEXT, autor_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_notas_conv ON cliente_notas (conversa_id, created_at DESC)`).catch(() => {});
    /* 🤖 RESGATE COM IA: lead sem venda registrada recebe tentativas em DIAS
       diferentes, e a equipe ganha um resumo interno da conversa antes de cada
       uma. O contador vive na conversa pra nunca repetir a mesma tentativa. */
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resgate_tentativas INT DEFAULT 0`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resgate_ultima TIMESTAMPTZ`).catch(() => {});
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resgate_pausado BOOLEAN DEFAULT false`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_conv_resgate ON conversas (resgate_tentativas, last_message_at)`).catch(() => {});
    // 💉 Carteira vacinal do paciente: dose de cada marco (0-18m) aplicada
    await query(`CREATE TABLE IF NOT EXISTS carteira_doses (
      id SERIAL PRIMARY KEY, conversa_id TEXT, lead_id TEXT, marco_mes INT NOT NULL,
      vacina TEXT, aplicada BOOLEAN DEFAULT true, data_aplicacao DATE,
      observacao TEXT, registrado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    // Controle DOSE A DOSE: uma linha por vacina dentro do marco
    await query(`DROP INDEX IF EXISTS idx_carteira_unico`).catch(() => {});
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_carteira_dose ON carteira_doses (COALESCE(conversa_id,''), marco_mes, COALESCE(vacina,''))`).catch(() => {});

    // 🔒 Fechamento DIÁRIO de caixa e estoque (foto do dia, não muda depois)
    await query(`CREATE TABLE IF NOT EXISTS fechamentos_diarios (
      data DATE PRIMARY KEY, dados JSONB NOT NULL, observacao TEXT,
      fechado_por_id TEXT, fechado_por_nome TEXT, fechado_em TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});

    // 🎯 Metas do relatório individual — valores definidos pelo master no modelo
    // que ele enviou (setor de vacinas: R$ 19.000/dia e R$ 9.500 por pessoa).
    // Semeadas UMA vez; depois a gestão ajusta pela tela sem ser sobrescrita.
    try {
      const { rows: [jaTem] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'relatorio_lider' LIMIT 1");
      if (!jaTem) {
        await query(`INSERT INTO configuracoes (chave, valor) VALUES ('relatorio_lider', $1::jsonb)`,
          [JSON.stringify({
            setores: {
              vacinas:   { dia: 19000, individual: 9500 },
              consultas: { dia: 0, individual: 0 },
              terapias:  { dia: 0, individual: 0 },
            },
            // Foco diário definido pelo master: 2 planos e 5 pacotes mensais
            categorias: [
              { rotulo: 'Planos Vacinais', categorias: ['Plano Vacinal'], meta: 2 },
              { rotulo: 'Pacotes Mensais', categorias: ['Fidelidade Mensal'], meta: 5 },
            ],
          })]);
        console.log('🎯 Metas do relatório individual semeadas (vacinas: 19.000/dia · 9.500 individual)');
      }
    } catch (e) { console.error('Seed metas relatório:', e.message); }

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

    // Raylane: setor VACINAS (cobre vacinas + planos vacinais). Só ela vê vacinas.
    const { rows: [flagRaySetor] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_raylane_vacinas_v1'");
    if (!flagRaySetor) {
      await query(`UPDATE usuarios SET setor = 'vacinas', setores = NULL WHERE email = 'raylane@vittalissaude.com.br' OR cpf = '63358210367'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_raylane_vacinas_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('💉 Raylane: setor vacinas');
    }

    // Raylane: líder de equipe (ganha a tela de Planejamento). Uma vez.
    const { rows: [flagRayLid] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_raylane_lider_v1'");
    if (!flagRayLid) {
      await query(`UPDATE usuarios SET lider = true WHERE email = 'raylane@vittalissaude.com.br' OR cpf = '63358210367'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_raylane_lider_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('👑 Raylane: líder de equipe (Planejamento)');
    }

    // Danielle: acesso TOTAL — vê tudo e todos os leads sempre (híbrida completa).
    const { rows: [flagDani] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_danielle_vetudo_v5'");
    if (!flagDani) {
      await query(`UPDATE usuarios SET setores = '{vacinas,consultas,terapias}', setor = 'consultas', ve_tudo = true, ativo = true
                   WHERE email = 'danielle@vittalissaude.com.br' OR cpf = '61867382300'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_danielle_vetudo_v5', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🔓 Danielle: acesso total (vê tudo e todos os leads)');
    }

    // Novas atendentes (híbridas: vacinas + consultas + terapias). Login por CPF,
    // senha padrão Vittalis@2026 (trocam depois no sistema).
    const { rows: [flagNovas] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_novas_atendentes_v1'");
    if (!flagNovas) {
      const bcryptN = await import('bcryptjs');
      const hashN = await bcryptN.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
        VALUES (gen_random_uuid()::text, 'Fernanda Costa Moraes', 'fernanda.costa@vittahub.local', '06105959389', $1, 'atendente', '#ec4899', true, 'consultas', '{consultas,terapias}')
        ON CONFLICT (email) DO NOTHING`, [hashN]).catch((e) => console.error('seed Fernanda:', e.message));
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
        VALUES (gen_random_uuid()::text, 'Steicy Kamilly Alves', 'steicy.alves@vittahub.local', '62339059313', $1, 'atendente', '#14b8a6', true, 'consultas', '{consultas,terapias}')
        ON CONFLICT (email) DO NOTHING`, [hashN]).catch((e) => console.error('seed Steicy:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_novas_atendentes_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Novas atendentes: Fernanda + Steicy');
    }

    // Garante que Fernanda e Steicy fiquem em CONSULTAS + TERAPIAS (corrige se já
    // tinham sido criadas com vacinas).
    const { rows: [flagNovas2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_novas_consulterapia_v2'");
    if (!flagNovas2) {
      await query(`UPDATE usuarios SET setores = '{consultas,terapias}', setor = 'consultas'
                   WHERE cpf IN ('06105959389','62339059313')`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_novas_consulterapia_v2', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🩺🧩 Fernanda + Steicy: consultas + terapias');
    }

    // ── CORREÇÃO DE LOGIN: Danielle e Steicy — garante conta ATIVA e senha conhecida
    // (Vittalis@2026), independente do estado anterior. Roda uma vez; elas trocam depois.
    const { rows: [flagFixLogin] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'fix_login_dani_steicy_v1'");
    if (!flagFixLogin) {
      const bcryptFL = await import('bcryptjs');
      const hashFL = await bcryptFL.default.hash('Vittalis@2026', 10);
      // Danielle (já existe): reseta a senha e garante ativa.
      await query(`UPDATE usuarios SET senha = $1, ativo = true WHERE cpf = '61867382300'`, [hashFL])
        .catch((e) => console.error('fix login Danielle:', e.message));
      // Steicy: se existir, reseta senha/ativa; se não existir, cria.
      const { rows: steicyRow } = await query("SELECT id FROM usuarios WHERE cpf = '62339059313' LIMIT 1").catch(() => ({ rows: [] }));
      if (steicyRow.length) {
        await query(`UPDATE usuarios SET senha = $1, ativo = true WHERE cpf = '62339059313'`, [hashFL])
          .catch((e) => console.error('fix login Steicy (update):', e.message));
      } else {
        await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
          VALUES (gen_random_uuid()::text, 'Steicy Kamilly Alves', 'steicy.alves@vittahub.local', '62339059313', $1, 'atendente', '#14b8a6', true, 'consultas', '{consultas,terapias}')
          ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, ativo = true, cpf = EXCLUDED.cpf`, [hashFL])
          .catch((e) => console.error('fix login Steicy (insert):', e.message));
      }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('fix_login_dani_steicy_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🔧 Login corrigido: Danielle + Steicy (ativas, senha Vittalis@2026)');
    }

    // Beatriz dos Santos Duarte — HÍBRIDA (vacinas + consultas + terapias). CPF, Vittalis@2026.
    const { rows: [flagBeatriz] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_beatriz_v1'");
    if (!flagBeatriz) {
      const bcryptB = await import('bcryptjs');
      const hashB = await bcryptB.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
        VALUES (gen_random_uuid()::text, 'Beatriz dos Santos Duarte', 'beatriz.duarte@vittahub.local', '17210177710', $1, 'atendente', '#8b5cf6', true, 'consultas', '{vacinas,consultas,terapias}')
        ON CONFLICT (email) DO NOTHING`, [hashB]).catch((e) => console.error('seed Beatriz:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_beatriz_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Beatriz: híbrida (vacinas + consultas + terapias)');
    }

    // Inativa a Fernanda (não loga mais). Reversível: é só reativar no sistema.
    const { rows: [flagFernOff] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_fernanda_inativa_v1'");
    if (!flagFernOff) {
      await query(`UPDATE usuarios SET ativo = false WHERE cpf = '06105959389'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_fernanda_inativa_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🚫 Fernanda: inativada');
    }

    // José Carlos — MARKETING. O trabalho dele é varrer lead por lead e conversa
    // por conversa pra achar onde a conversão trava, e responder junto com a
    // gestão. Por isso entra como gestão (supervisor) + ve_tudo: enxerga todos os
    // setores e todas as carteiras, e o detector anti-varredura não o bloqueia —
    // abrir 80 conversas numa manhã É o serviço dele, não coleta de base.
    // Senha inicial Vittalis@2026 (ele troca no primeiro acesso).
    const { rows: [flagJose] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_jose_marketing_v1'");
    if (!flagJose) {
      const bcryptJ = await import('bcryptjs');
      const hashJ = await bcryptJ.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, ve_tudo)
        VALUES (gen_random_uuid()::text, 'José Carlos Ramos da Silva', 'jose.carlos@vittahub.local', '62075159351', $1, 'supervisor', '#f97316', true, NULL, true)
        ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, ativo = true, role = 'supervisor', ve_tudo = true`,
        [hashJ]).catch((e) => console.error('seed José (marketing):', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_jose_marketing_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 José Carlos: Marketing (vê todos os setores e carteiras)');
    }

    // Carlos Eduardo — MARKETING, mesma dupla do José: analisa conversa por
    // conversa atrás dos pontos onde o lead esfria. Mesmo acesso, mesmo motivo
    // (volume de leitura é o trabalho dele, não varredura de base).
    const { rows: [flagCarlos] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_carlos_marketing_v1'");
    if (!flagCarlos) {
      const bcryptC2 = await import('bcryptjs');
      const hashC2 = await bcryptC2.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, ve_tudo)
        VALUES (gen_random_uuid()::text, 'Carlos Eduardo Santos Rosa', 'carlos.eduardo@vittahub.local', '07964909371', $1, 'supervisor', '#a855f7', true, NULL, true)
        ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, ativo = true, role = 'supervisor', ve_tudo = true`,
        [hashC2]).catch((e) => console.error('seed Carlos (marketing):', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_carlos_marketing_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Carlos Eduardo: Marketing (vê todos os setores e carteiras)');
    }

    // Mayara — ATENDIMENTO GERAL: atende os três setores (vacinas, consultas e
    // terapias), então entra como atendente híbrida. Continua com as travas da
    // ponta — telefone mascarado nas listas e só os leads da carteira dela.
    // Setor principal 'vacinas' (é o carro-chefe da casa); os outros dois vêm
    // pela lista de setores.
    const { rows: [flagMayara] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_mayara_geral_v1'");
    if (!flagMayara) {
      const bcryptM = await import('bcryptjs');
      const hashM = await bcryptM.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
        VALUES (gen_random_uuid()::text, 'Mayara Santos Aguiar Miranda', 'mayara.miranda@vittahub.local', '61242108351', $1, 'atendente', '#0ea5e9', true, 'vacinas', '{vacinas,consultas,terapias}')
        ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, ativo = true, setores = EXCLUDED.setores`,
        [hashM]).catch((e) => console.error('seed Mayara:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_mayara_geral_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Mayara: atendimento geral (vacinas + consultas + terapias)');
    }

    // Suellen — ATENDIMENTO GERAL, mesma configuração da Mayara: híbrida nos três
    // setores, com as travas normais da ponta.
    const { rows: [flagSuellen] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_suellen_geral_v1'");
    if (!flagSuellen) {
      const bcryptS = await import('bcryptjs');
      const hashS = await bcryptS.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
        VALUES (gen_random_uuid()::text, 'Suellen Pãozinho Anceles', 'suellen.anceles@vittahub.local', '61683378300', $1, 'atendente', '#22c55e', true, 'vacinas', '{vacinas,consultas,terapias}')
        ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, ativo = true, setores = EXCLUDED.setores`,
        [hashS]).catch((e) => console.error('seed Suellen:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_suellen_geral_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Suellen: atendimento geral (vacinas + consultas + terapias)');
    }

    // Stefany — ATENDIMENTO HÍBRIDO: mesma configuração da Mayara e da Suellen,
    // atende os três setores com as travas normais da ponta.
    const { rows: [flagStefany] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_stefany_hibrida_v1'");
    if (!flagStefany) {
      const bcryptSt = await import('bcryptjs');
      const hashSt = await bcryptSt.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
        VALUES (gen_random_uuid()::text, 'Stefany Cristiny Costa Bandeira', 'stefany.bandeira@vittahub.local', '61953622399', $1, 'atendente', '#f43f5e', true, 'vacinas', '{vacinas,consultas,terapias}')
        ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, ativo = true, setores = EXCLUDED.setores`,
        [hashSt]).catch((e) => console.error('seed Stefany:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_stefany_hibrida_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Stefany: atendimento híbrido (vacinas + consultas + terapias)');
    }

    // Abertura da conversa: a equipe passa a usar o mesmo texto do menu da Vitta
    // (as três frentes com o que a cliente reconhece, sem tom de call center).
    const { rows: [flagAbertura] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_abertura_tres_frentes_v1'");
    if (!flagAbertura) {
      await query(`UPDATE respostas_rapidas SET texto = $1 WHERE titulo = 'Boas-vindas'`, [
`Oi! Que bom falar com você 😊
Aqui é da *Vittalis Saúde* 💙

A gente cuida da sua família em três frentes:

💉 *Vacinas* — infantil e adulto, na clínica ou em casa
🩺 *Consultas* — pediatria, neuropediatria e outras especialidades
🤲 *Terapias* — fono, psicologia, psicopedagogia, T.O. e ABA

Qual delas te trouxe aqui hoje?`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_abertura_tres_frentes_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('👋 Abertura atualizada: as três frentes da clínica');
    }

    /* Meta de planos terapêuticos: 100 → 26 por mês (pedido do master, que é
       ~1 por dia útil). Roda uma vez: se ele ajustar depois pela tela, o seed
       não desfaz por cima. */
    const { rows: [flagMetaTer] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_meta_terapias_26_v1'");
    if (!flagMetaTer) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', jsonb_build_object('planos_terapeuticos', 26))
                   ON CONFLICT (chave) DO UPDATE SET valor = jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{planos_terapeuticos}', to_jsonb(26)), updated_at = NOW()`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_meta_terapias_26_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🧩 Meta de planos terapêuticos: 26 por mês');
    }

    /* 🎯 METAS INDIVIDUAIS (definidas pelo master). Duas unidades convivendo:
       · Raylane e Stefany → R$ 100 mil no mês
       · Danielle, Suellen e Mayara → 10 consultas por dia (× 26 dias = 260/mês)
       Não usa flag de "roda uma vez": se o master mudar depois pela tela, o
       UPDATE aqui não desfaz — ele só cria o que ainda está zerado. */
    const { rows: [flagMetasInd] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_metas_individuais_v1'");
    if (!flagMetasInd) {
      // Meta em dinheiro (mês)
      await query(`UPDATE usuarios SET meta_tipo = 'valor', meta_individual = 100000
                    WHERE cpf IN ('63358210367','61953622399')`).catch(() => {});
      // Meta em consultas por dia (× dias úteis)
      await query(`UPDATE usuarios SET meta_tipo = 'consultas', meta_qtd_dia = 10, meta_dias_uteis = 26
                    WHERE cpf IN ('61867382300','61683378300','61242108351')`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_metas_individuais_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🎯 Metas individuais: Raylane/Stefany R$100k · Danielle/Suellen/Mayara 10 consultas/dia');
    }

    /* 🧭 SETORES DEFINITIVOS (definidos pelo master):
       · Raylane e Stefany → VACINAS (meta R$ 100 mil/mês)
       · Danielle, Suellen e Mayara → CONSULTAS + TERAPIAS
       Suellen, Mayara e Stefany tinham entrado como híbridas nos três setores;
       aqui elas ficam onde realmente atendem — senão a triagem manda conversa
       de vacina pra quem é de consulta, e o placar cobra a meta errada. */
    /* v2 do seed. A v1 comparava o CPF CRU (`cpf IN ('61867382300')`), mas o
       cadastro pode ter o CPF com ponto e traço — o próprio login normaliza
       antes de comparar, justamente por isso. Nenhuma linha era atingida, o
       .catch engolia o silêncio e a flag marcava o seed como feito: a Danielle
       ficou SEM setor, e quem não tem setor vê todas as abas. Era esse o motivo
       de "Solicitar Vacinas" continuar aparecendo pra ela.
       Agora normaliza igual ao login, sem catch mudo, e registra quantas linhas
       mudaram — se der zero, aparece no log em vez de passar batido. */
    const { rows: [flagSetores3] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_setores_definitivos_v2'");
    if (!flagSetores3) {
      const soDigitos = "regexp_replace(COALESCE(cpf,''),'\\D','','g')";
      const rVac = await query(
        `UPDATE usuarios SET setor = 'vacinas', setores = NULL
          WHERE ${soDigitos} IN ('63358210367','61953622399')`);        // Raylane, Stefany
      const rCon = await query(
        `UPDATE usuarios SET setor = 'consultas', setores = '{consultas,terapias}'
          WHERE ${soDigitos} IN ('61867382300','61683378300','61242108351')`); // Danielle, Suellen, Mayara
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_setores_definitivos_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
      /* Marketing (José e Carlos) recebe os TRÊS setores de forma explícita.
         Antes eles ficavam "sem setor" e a regra usava isso como sinal de "vê
         tudo" — o que tornava qualquer cadastro incompleto indistinguível do
         marketing. Com os três marcados, "sem setor" volta a significar
         cadastro faltando, e o sistema pode fechar em vez de abrir. */
      const rMkt = await query(
        `UPDATE usuarios SET setores = '{vacinas,consultas,terapias}'
          WHERE ${soDigitos} IN ('62075159351','07964909371')`);          // José, Carlos
      console.log(`🧭 Setores aplicados — vacinas: ${rVac.rowCount} · consultas+terapias: ${rCon.rowCount} · marketing: ${rMkt.rowCount}`);
      if (rVac.rowCount + rCon.rowCount < 5) {
        console.warn('⚠️ Nem todos os setores foram aplicados: confira os CPFs em Configurações → Usuários');
      }
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
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ`).catch(() => {});
    // Fechamento de repasses: registro de pagamento do repasse mensal por atendente.
    await query(`CREATE TABLE IF NOT EXISTS repasses_pagamentos (
      id SERIAL PRIMARY KEY,
      mes TEXT NOT NULL,
      atendente_id TEXT,
      atendente_nome TEXT,
      valor NUMERIC(10,2) DEFAULT 0,
      pago_em TIMESTAMPTZ DEFAULT NOW(),
      pago_por TEXT,
      UNIQUE (mes, atendente_id)
    )`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS local_link TEXT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS email TEXT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2)`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS forma_pagamento TEXT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS parcelas INT`).catch(() => {});
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS conversa_id TEXT`).catch(() => {});
    // Confirmação automática de véspera (não reenviar pro mesmo evento)
    await query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS confirmacao_enviada BOOLEAN DEFAULT false`).catch(() => {});
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
    // CAIXA: múltiplos comprovantes por venda (2+), cada um com análise da IA própria
    await query(`CREATE TABLE IF NOT EXISTS venda_comprovantes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      venda_id TEXT NOT NULL, data_url TEXT, nome TEXT, tipo TEXT,
      analise JSONB, criado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_vcomp_venda ON venda_comprovantes (venda_id)`).catch(() => {});
    // CAIXA: arquivo de vendas excluídas — guarda um snapshot completo antes de
    // remover das contas, para nada se perder (rastreável e recuperável).
    // 🧾 Orçamentos montados na Tabela de Preços — memória da proposta enviada
    await query(`CREATE TABLE IF NOT EXISTS orcamentos (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      criado_por TEXT, criado_por_nome TEXT,
      cliente_nome TEXT, conversa_id TEXT,
      itens JSONB, subtotal NUMERIC(10,2) DEFAULT 0, desconto NUMERIC(10,2) DEFAULT 0,
      total NUMERIC(10,2) DEFAULT 0, parcelas INT DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_orcamentos_data ON orcamentos (created_at)`).catch(() => {});
    // "Virou venda": fecha o ciclo orçamento → venda sem redigitar
    await query(`ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS fechado BOOLEAN DEFAULT false`).catch(() => {});
    await query(`ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS venda_id TEXT`).catch(() => {});
    // 📸 Banco de prints: reconstituição da tela no momento da captura (30 dias)
    await query(`CREATE TABLE IF NOT EXISTS capturas_print (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      usuario_id TEXT, usuario_nome TEXT, tela TEXT, conversa TEXT, conv_id TEXT,
      imagem TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_capturas_print_data ON capturas_print (created_at)`).catch(() => {});
    // 🎓 Aula de vendas gerada pela IA a partir de cada case de sucesso
    await query(`CREATE TABLE IF NOT EXISTS cases_aulas (
      conversa_id TEXT PRIMARY KEY, texto TEXT, por TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    /* 🩺 Pacientes do VittaMed espelhados aqui (cache local da ponte).
       Quem está cadastrado lá JÁ CONSULTOU — a Vitta usa isso pra tratar o
       contato como paciente da casa, não como desconhecido. Telefone guardado
       só em dígitos, sem o 55. */
    await query(`CREATE TABLE IF NOT EXISTS vittamed_pacientes (
      telefone TEXT PRIMARY KEY, nome TEXT, dados JSONB DEFAULT '{}'::jsonb,
      visto_em TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS vendas_excluidas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      venda_id TEXT, dados JSONB,
      excluida_por TEXT, excluida_em TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    // Migra comprovantes antigos (coluna única) para a nova tabela, uma vez.
    const { rows: [fVc] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'migra_comprovantes_v1'").catch(() => ({ rows: [] }));
    if (!fVc) {
      await query(`INSERT INTO venda_comprovantes (venda_id, data_url, nome, tipo, analise)
                   SELECT id, comprovante, comprovante_nome, comprovante_tipo, comprovante_analise
                   FROM vendas WHERE comprovante IS NOT NULL`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('migra_comprovantes_v1','{"ok":true}') ON CONFLICT DO NOTHING`).catch(() => {});
    }
    // CAIXA: saídas/despesas — pra fechar o saldo real (entrou − saiu)
    await query(`CREATE TABLE IF NOT EXISTS despesas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      descricao TEXT, categoria TEXT, valor NUMERIC(10,2) DEFAULT 0,
      setor TEXT, forma_pagamento TEXT, data DATE DEFAULT CURRENT_DATE,
      criado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas (data)`).catch(() => {});
    // QUIZ DIÁRIO de vendas (gamificação do aprendizado) — 1 quiz por dia por setor
    await query(`CREATE TABLE IF NOT EXISTS quiz_diario (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      data DATE NOT NULL, setor TEXT NOT NULL DEFAULT 'geral',
      perguntas JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (data, setor)
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS quiz_respostas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      usuario_id TEXT NOT NULL, usuario_nome TEXT, data DATE NOT NULL, setor TEXT,
      score INT DEFAULT 0, acertos INT DEFAULT 0, total INT DEFAULT 0,
      respostas JSONB, created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (usuario_id, data)
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_quizresp_data ON quiz_respostas (data)`).catch(() => {});
    // BANCO DE DOCUMENTOS: docs que a equipe envia ao cliente no dia a dia (PDF/Word/imagem)
    await query(`CREATE TABLE IF NOT EXISTS documentos_banco (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nome TEXT, arquivo TEXT, mimetype TEXT,
      criado_por TEXT, criado_por_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    // MENSAGENS AGENDADAS: disparo automático de mensagem pro cliente em data/hora
    await query(`CREATE TABLE IF NOT EXISTS mensagens_agendadas (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversa_id TEXT NOT NULL, texto TEXT NOT NULL,
      enviar_em TIMESTAMPTZ NOT NULL, status TEXT DEFAULT 'pendente',
      criado_por TEXT, criado_por_id TEXT, erro TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), enviada_em TIMESTAMPTZ
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_msgag_due ON mensagens_agendadas (status, enviar_em)`).catch(() => {});
    // ARQUIVOS DAS ABAS: PDF/Word etc. anexados dentro de cada aba (Vacinas, Planos...)
    await query(`CREATE TABLE IF NOT EXISTS pasta_arquivos (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      chave TEXT NOT NULL, nome TEXT, arquivo TEXT, mimetype TEXT,
      criado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_pastarq_chave ON pasta_arquivos (chave)`).catch(() => {});
    // MEU AMIGO: desabafo com IA acolhedora — PRIVADO por usuário (nem o master lê)
    await query(`CREATE TABLE IF NOT EXISTS amigo_mensagens (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      usuario_id TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_amigo_user ON amigo_mensagens (usuario_id, created_at)`).catch(() => {});
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
    /* ESTUDOS: conversa que alguém escolheu estudar.
       Diferente de Cases de Sucesso, que é automático (conversa que virou venda):
       aqui é curadoria humana — cabe a venda perdida, a objeção que travou, o
       atendimento que a gente não quer repetir. O que mais ensina raramente é
       o que deu certo.
       As MENSAGENS não são copiadas para cá: o estudo aponta para a conversa e
       lê ao vivo. Duplicar conversa de paciente por causa de estudo seria criar
       uma segunda cópia de dado clínico sem ninguém cuidando dela. */
    await query(`CREATE TABLE IF NOT EXISTS estudos (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversa_id TEXT UNIQUE,
      contact_nome TEXT,
      setor TEXT,
      titulo TEXT,
      motivo TEXT,
      tags TEXT[] DEFAULT '{}',
      status TEXT DEFAULT 'aberto',
      aprendizado TEXT,
      analise TEXT,
      analise_em TIMESTAMPTZ,
      criado_por TEXT,
      criado_por_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_estudos_status ON estudos (status, created_at DESC)`).catch(() => {});
    // Conversa excluída não pode levar o aprendizado junto: o vínculo cai, o
    // que a equipe aprendeu fica.
    await query(`ALTER TABLE estudos DROP CONSTRAINT IF EXISTS estudos_conversa_fk`).catch(() => {});
    await query(`ALTER TABLE estudos ADD CONSTRAINT estudos_conversa_fk
      FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL`).catch(() => {});

    // ANEXOS do planejamento (documentos da líder) — arquivo guardado em base64 (data URL).
    await query(`CREATE TABLE IF NOT EXISTS planejamento_anexos (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      usuario_id TEXT,
      nome TEXT,
      tipo TEXT,
      data_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS idx_plananexos_user ON planejamento_anexos (usuario_id)`).catch(() => {});
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
    /* Foto que chega na conversa entra sozinha na Biblioteca (pedido do master).
       origem_msg_id é o id da mensagem no WhatsApp: com índice único, webhook
       repetido não duplica a mesma foto. conversa_id liga a foto de volta ao
       atendimento — é o que permite o título sair com o nome do cliente. */
    await query(`ALTER TABLE biblioteca_midias ADD COLUMN IF NOT EXISTS origem TEXT`).catch(() => {});
    await query(`ALTER TABLE biblioteca_midias ADD COLUMN IF NOT EXISTS origem_msg_id TEXT`).catch(() => {});
    await query(`ALTER TABLE biblioteca_midias ADD COLUMN IF NOT EXISTS conversa_id TEXT`).catch(() => {});
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS biblioteca_origem_msg_idx ON biblioteca_midias (origem_msg_id) WHERE origem_msg_id IS NOT NULL`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS biblioteca_setor_idx ON biblioteca_midias (setor, created_at DESC)`).catch(() => {});
    /* A foto da conversa NÃO é copiada: a biblioteca aponta pra mensagem onde
       ela já está. Copiar guardava a mesma imagem DUAS VEZES no banco — e com
       toda foto entrando sozinha, isso vira centenas de MB por mês no Railway,
       que é dinheiro. Por isso `data` deixou de ser obrigatória e existe
       msg_id: quando ele está preenchido, a imagem é lida da mensagem. */
    await query(`ALTER TABLE biblioteca_midias ADD COLUMN IF NOT EXISTS msg_id INT`).catch(() => {});
    await query(`ALTER TABLE biblioteca_midias ALTER COLUMN data DROP NOT NULL`).catch(() => {});

    // 💟 FIGURINHAS OFICIAIS da Vittalis (logo + frases) — semeadas uma vez;
    // os .webp vivem em backend/src/assets/figurinhas (gerados pelo Claude).
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const aqui = path.dirname(fileURLToPath(import.meta.url));
      const dirFig = path.join(aqui, '../assets/figurinhas');
      if (fs.existsSync(dirFig)) {
        const NOMES = { 'bom-dia': 'Vitta · Bom dia', 'boa-tarde': 'Vitta · Boa tarde', 'obrigada': 'Vitta · Obrigada pela confiança',
          'confirmado': 'Vitta · Confirmadíssimo', 'esperando': 'Vitta · Estamos te esperando', 'protecao': 'Vitta · Proteção em dia',
          'parabens': 'Vitta · Parabéns', 'conta-comigo': 'Vitta · Conta com a gente',
          'excelente-semana': 'Vitta · Excelente semana', 'abencoado-mes': 'Vitta · Abençoado mês',
          'agendamento-confirmado': 'Vitta · Agendamento confirmado', 'princesa': 'Vitta · Princesa linda e protegida',
          'principe': 'Vitta · Príncipe lindo e protegido', 'consulta-confirmada': 'Vitta · Consulta confirmada' };
        for (const f of fs.readdirSync(dirFig).filter(x => x.endsWith('.webp'))) {
          const titulo = NOMES[f.replace('.webp', '')] || `Vitta · ${f}`;
          const { rows: [ja] } = await query(`SELECT 1 FROM biblioteca_midias WHERE titulo = $1 AND tipo = 'figurinha' LIMIT 1`, [titulo]);
          if (ja) continue;
          const b64 = fs.readFileSync(path.join(dirFig, f)).toString('base64');
          await query(`INSERT INTO biblioteca_midias (titulo, tipo, setor, categoria, mime, data)
                       VALUES ($1, 'figurinha', 'geral', 'Vittalis', 'image/webp', $2)`, [titulo, b64]);
        }
        console.log('💟 Figurinhas oficiais da Vittalis semeadas');
      }
    } catch (e) { console.error('Seed figurinhas:', e.message); }

    /* 🧩 ÁREA DE TERAPIAS — pedido do master: uma aba só de terapias, onde a
       equipe puxa o paciente para a área e registra o plano terapêutico.
       Fica separada das vendas: aqui o que conta é o acompanhamento. */
    await query(`CREATE TABLE IF NOT EXISTS terapia_pacientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL, telefone TEXT, responsavel TEXT,
      conversa_id TEXT, lead_id TEXT, origem TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'avaliacao',
      observacoes TEXT,
      criado_por_id TEXT, criado_por_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    // Mesmo telefone não entra duas vezes na área (evita paciente duplicado)
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS terapia_pacientes_tel_idx
      ON terapia_pacientes(telefone) WHERE telefone IS NOT NULL AND telefone <> ''`).catch(() => {});

    await query(`CREATE TABLE IF NOT EXISTS terapia_planos (
      id SERIAL PRIMARY KEY,
      paciente_id INT NOT NULL REFERENCES terapia_pacientes(id) ON DELETE CASCADE,
      especialidade TEXT, sessoes_semana INT DEFAULT 1, valor_mensal NUMERIC,
      data_inicio DATE, status TEXT DEFAULT 'ativo', observacoes TEXT,
      criado_por_id TEXT, criado_por_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    // Dias e horários fixos de cada terapia: [{dia:1,hora:'14:00'}, …]
    // (0=domingo … 6=sábado). É o que a equipe marca ao registrar o plano.
    await query(`ALTER TABLE terapia_planos ADD COLUMN IF NOT EXISTS horarios JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    // Quanto a família paga por SESSÃO e por MÊS naquela terapia (pedido do master)
    await query(`ALTER TABLE terapia_planos ADD COLUMN IF NOT EXISTS valor_sessao NUMERIC`).catch(() => {});
    // Quem atende aquela terapia — sem isso a grade da semana não consegue
    // apontar terapeuta marcado em dois lugares no mesmo horário.
    await query(`ALTER TABLE terapia_planos ADD COLUMN IF NOT EXISTS profissional TEXT`).catch(() => {});
    // A clínica é PARTICULAR — o master confirmou que não trabalhamos com plano
    // de saúde. Os campos de convênio/guia saíram; o que importa aqui é o dia
    // em que a família paga a mensalidade daquela terapia.
    await query(`ALTER TABLE terapia_planos DROP COLUMN IF EXISTS convenio`).catch(() => {});
    await query(`ALTER TABLE terapia_planos DROP COLUMN IF EXISTS autorizacao`).catch(() => {});
    await query(`ALTER TABLE terapia_planos DROP COLUMN IF EXISTS sessoes_autorizadas`).catch(() => {});
    await query(`ALTER TABLE terapia_planos DROP COLUMN IF EXISTS autorizacao_validade`).catch(() => {});
    await query(`ALTER TABLE terapia_planos ADD COLUMN IF NOT EXISTS dia_pagamento INT`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS terapia_planos_pac_idx ON terapia_planos(paciente_id)`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS terapia_planos_criado_idx ON terapia_planos(created_at)`).catch(() => {});

    /* Pacote de sessões + acompanhamento (pedido do master: "número de sessões,
       acompanhamento e observação sobre cada um", imitando os sistemas de ABA).
       O pacote fica no PACIENTE porque é o que a família contrata; a sessão é
       registrada uma a uma, com presença — é isso que vira o acompanhamento. */
    await query(`ALTER TABLE terapia_pacientes ADD COLUMN IF NOT EXISTS sessoes_contratadas INT`).catch(() => {});
    await query(`ALTER TABLE terapia_pacientes ADD COLUMN IF NOT EXISTS acompanhamento TEXT`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS terapia_sessoes (
      id SERIAL PRIMARY KEY,
      paciente_id INT NOT NULL REFERENCES terapia_pacientes(id) ON DELETE CASCADE,
      especialidade TEXT,
      data DATE NOT NULL,
      hora TEXT,
      presenca TEXT DEFAULT 'presente',
      observacao TEXT,
      profissional TEXT,
      criado_por_id TEXT, criado_por_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS terapia_sessoes_pac_idx ON terapia_sessoes(paciente_id, data DESC)`).catch(() => {});

    /* Fotos ao longo das terapias, para virar ÁLBUM da criança (pedido do
       master). Tabela própria e DUAS versões de cada foto: a miniatura é o que
       a galeria carrega (dezenas de fotos numa tela só) e a grande só desce
       quando alguém abre — senão o álbum de uma criança de 1 ano de terapia
       travaria o celular da equipe. */
    await query(`CREATE TABLE IF NOT EXISTS terapia_fotos (
      id SERIAL PRIMARY KEY,
      paciente_id INT NOT NULL REFERENCES terapia_pacientes(id) ON DELETE CASCADE,
      sessao_id INT REFERENCES terapia_sessoes(id) ON DELETE SET NULL,
      data DATE NOT NULL,
      legenda TEXT,
      arquivo TEXT NOT NULL,
      miniatura TEXT,
      mimetype TEXT,
      criado_por_id TEXT, criado_por_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS terapia_fotos_pac_idx ON terapia_fotos(paciente_id, data DESC)`).catch(() => {});

    // Controle dos lembretes enviados para a agenda do VittaMed. Sem isto o
    // paciente do outro sistema receberia a mensagem de novo a cada rodada.
    await query(`CREATE TABLE IF NOT EXISTS lembretes_vittamed (
      agendamento_id INT PRIMARY KEY, data DATE NOT NULL, telefone TEXT,
      paciente TEXT, enviado_em TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await query(`CREATE INDEX IF NOT EXISTS lembretes_vittamed_data_idx ON lembretes_vittamed(data)`).catch(() => {});

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

    // Renomeia a conta "Dra. Nágila" para apenas "Maria" (a pedido) — inclusive as
    // mensagens JÁ enviadas (o nome fica gravado em cada mensagem).
    const { rows: [flagMaria] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_nome_maria_v2'");
    if (!flagMaria) {
      await query(`UPDATE usuarios SET nome = 'Maria' WHERE email = 'nagila@vittalissaude.com.br'`).catch(() => {});
      // Mensagens antigas: reescreve o remetente gravado.
      await query(`UPDATE mensagens SET sender_nome = 'Maria' WHERE sender_nome IN ('Dra. Nágila','Dra.','Dra','Nágila Santos','Nágila')`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_nome_maria_v2', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🪪 Conta e mensagens renomeadas para Maria');
    }

    /* 💉 CALENDÁRIO VACINAL — mistura o esquema salvo com as ALTERNATIVAS de
       marca (pedido do master: "muitos são Pneumocócica 20").
       O calendário fica salvo em configuracoes.calendario_vacinal, e é ELE que
       manda na tela — por isso mexer só no padrão do código não mudava nada
       pra clínica. Esta passada acrescenta as alternativas ("A ou B") ao que já
       está salvo, SEM apagar o que a gestão escreveu: só reescreve os nomes que
       viraram opção. Marcos, idades e demais vacinas ficam intactos. */
    const { rows: [flagCal] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_calendario_alternativas_v1'");
    if (!flagCal) {
      const { rows: [cal] } = await query("SELECT valor FROM configuracoes WHERE chave = 'calendario_vacinal'");
      const marcos = cal?.valor?.marcos;
      if (Array.isArray(marcos) && marcos.length) {
        // Cada troca: nome antigo → lista de alternativas com o padrão na frente
        const TROCAS = [
          [/\bPneumo(c[óo]cica)?\s*1[035]\b/gi, 'Pneumocócica 20 ou Pneumo 15 ou Pneumo 13'],
          [/\bHexavalente\b/gi, 'Hexavalente ou Hexacelular'],
          [/\bPentavalente\b/gi, 'Pentavalente ou Pentacelular'],
        ];
        let mexeu = 0;
        const novos = marcos.map(m => {
          let v = String(m.vacinas || '');
          for (const [re, sub] of TROCAS) {
            // Não mexe onde a alternativa já foi escrita à mão
            if (/\bou\b/i.test(v) && v.includes(sub.split(' ou ')[0])) continue;
            const antes = v;
            v = v.replace(re, sub);
            if (v !== antes) mexeu++;
          }
          return { ...m, vacinas: v.slice(0, 300) };
        });
        if (mexeu) {
          await query(`UPDATE configuracoes SET valor = $1::jsonb, updated_at = NOW() WHERE chave = 'calendario_vacinal'`,
            [JSON.stringify({ marcos: novos })]);
          console.log(`💉 Calendário vacinal: ${mexeu} linha(s) ganharam alternativa de marca`);
        }
      }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_calendario_alternativas_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    /* Beatriz saiu da equipe (avisado pelo master). Desativar em vez de apagar:
       o histórico de vendas e conversas dela continua no lugar, mas ela some do
       ranking, das listas e do login. Reversível em Configurações → Usuários. */
    const { rows: [flagBea] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_desativa_beatriz_v1'");
    if (!flagBea) {
      const r = await query(`UPDATE usuarios SET ativo = false, updated_at = NOW()
                              WHERE nome ILIKE 'Beatriz%' AND role IN ('atendente','supervisor')`).catch(() => ({ rowCount: 0 }));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_desativa_beatriz_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`👋 Beatriz desativada (${r.rowCount || 0} cadastro)`);
    }

    /* Poliana — ATENDIMENTO DE VACINAS (pedido do master). Só o setor de
       vacinas: nada de consultas nem terapias na tela dela. Entra com as travas
       normais da ponta — telefone mascarado nas listas e só os leads da
       carteira dela. Setor cadastrado explicitamente (cadastro sem setor
       ESCONDE as abas, e é isso que já custou vazamento entre setores). */
    const { rows: [flagPoliana] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_poliana_vacinas_v1'");
    if (!flagPoliana) {
      const bcryptP = await import('bcryptjs');
      const hashP = await bcryptP.default.hash('Vittalis@2026', 10);
      await query(`INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, setores)
        VALUES (gen_random_uuid()::text, 'Poliana dos Santos de Jesus de Matos', 'poliana.matos@vittahub.local', '60844921343', $1, 'atendente', '#a855f7', true, 'vacinas', NULL)
        ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, ativo = true, setor = 'vacinas', setores = NULL`,
        [hashP]).catch((e) => console.error('seed Poliana:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_poliana_vacinas_v1', '{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🌱 Poliana: atendimento de vacinas');
    }

    /* ⏸️ BOT DESLIGADO — ordem direta do master ("desliga o BOT").
       Liga o freio geral: nada sai sozinho pro cliente (Vitta respondendo,
       menu, reabertura de 24h, follow-up, resgate, lembretes e fila agendada),
       nem nas conversas com o bot ligado na mão. O Chat continua normal — a
       equipe escreve e envia.
       Roda UMA vez (flag): se depois o master religar pelo botão do topo, esta
       passada não desliga de novo no próximo deploy. */
    const { rows: [flagBot] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_bot_desligado_v1'");
    if (!flagBot) {
      await query(`INSERT INTO configuracoes (chave, valor)
                   VALUES ('automacao_pausada', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify({ pausada: true, por: 'Dr Miécio', em: new Date().toISOString() })]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_bot_desligado_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('⏸️ BOT DESLIGADO por ordem do master — nenhuma mensagem automática sai');
    }

    /* Ajuste pedido pelo master depois de desligar o bot: ele quer o FOLLOW-UP
       (e o resgate de leads) e os LEMBRETES trabalhando — só a Vitta
       conversando com o cliente é que fica calada.
       A fila de mensagens AGENDADAS segue parada: ela dispara texto escrito por
       uma atendente, e religar isso é decisão dele, não minha. */
    const { rows: [flagAut] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_automacao_areas_v1'");
    if (!flagAut) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('automacao_pausada', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify({ ligado: { bot: false, followup: true, lembretes: true, agendadas: false },
                          por: 'Dr Miécio', em: new Date().toISOString() })]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_automacao_areas_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('⏸️ Bot desligado · follow-up e lembretes LIGADOS (pedido do master)');
    }

    /* 👁️ VISÃO GERAL — campo próprio em vez de adivinhar por papel.
       Ordem do master: só a GESTÃO (ele) e o MARKETING (José e Carlos) veem a
       clínica inteira; supervisora vê o SETOR dela. Marcar num campo explícito
       evita o erro que já custou vazamento: tratar `supervisor` (ou `ve_tudo`)
       como "vê tudo". */
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ve_geral BOOLEAN DEFAULT false`).catch(() => {});
    const { rows: [flagVG] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ve_geral_v1'");
    if (!flagVG) {
      const soDig = "regexp_replace(COALESCE(cpf,''),'\\D','','g')";
      const rG = await query(`UPDATE usuarios SET ve_geral = true
                               WHERE role = 'master' OR ${soDig} IN ('62075159351','07964909371')`);  // José, Carlos (Marketing)
      // Garante que ninguém mais fique marcado por engano
      await query(`UPDATE usuarios SET ve_geral = false
                    WHERE role <> 'master' AND ${soDig} NOT IN ('62075159351','07964909371')`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ve_geral_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`👁️ Visão geral marcada para ${rG.rowCount || 0} usuário(s): gestão + marketing`);
    }

    /* 🎁 Prêmio do setor de CONSULTAS (ordem do master): R$ 2.600 no mês e
       R$ 100 a diária. O mensal entra nas duas metas (mínima e global) porque
       pra consultas o prêmio é um só — não existe "prêmio maior" separado. */
    const { rows: [flagPrem] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_premio_consultas_v1'");
    if (!flagPrem) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor =
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(COALESCE(configuracoes.valor,'{}'::jsonb), '{premios,consultas}', '2600'::jsonb, true),
                       '{premiosMin,consultas}', '2600'::jsonb, true),
                     '{premiosDia,consultas}', '100'::jsonb, true),
                     updated_at = NOW()`,
        [JSON.stringify({ premios: { consultas: 2600 }, premiosMin: { consultas: 2600 }, premiosDia: { consultas: 100 } })]).catch((e) => console.error('seed premio consultas:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_premio_consultas_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🎁 Consultas: prêmio R$ 2.600/mês + R$ 100 a diária');
    }

    /* 🎁 Prêmio de consultas — SEGUNDA passada (v2). A v1 usou jsonb_set com
       caminho '{premios,consultas}': quando a chave-pai não existe no JSON
       salvo, o Postgres IGNORA em silêncio — o R$ 2.600 nunca chegou ao banco
       e o placar caiu no padrão de R$ 1.500 (o master viu e cobrou). Aqui o
       merge é com ||, que cria os pais que faltarem. Regra dele: R$ 100 por
       dia batido × 26 dias úteis = R$ 2.600 no mês. */
    const { rows: [flagPrem2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_premio_consultas_v2'");
    if (!flagPrem2) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor =
                     COALESCE(configuracoes.valor,'{}'::jsonb)
                     || jsonb_build_object('premios',    COALESCE(configuracoes.valor->'premios','{}'::jsonb)    || '{"consultas":2600}'::jsonb)
                     || jsonb_build_object('premiosMin', COALESCE(configuracoes.valor->'premiosMin','{}'::jsonb) || '{"consultas":2600}'::jsonb)
                     || jsonb_build_object('premiosDia', COALESCE(configuracoes.valor->'premiosDia','{}'::jsonb) || '{"consultas":100}'::jsonb),
                     updated_at = NOW()`,
        [JSON.stringify({ premios: { consultas: 2600 }, premiosMin: { consultas: 2600 }, premiosDia: { consultas: 100 } })]).catch((e) => console.error('seed premio consultas v2:', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_premio_consultas_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🎁 Consultas (v2): prêmio R$ 100/diária × 26 = R$ 2.600/mês gravado de verdade');
    }

    /* 🕰️ CORREÇÃO RETROATIVA DO FUSO (autorizada pelo master: "corrija").
       Até 16/08 o INSERT de venda usava CURRENT_DATE (UTC): venda registrada
       entre 21h e 23h59 de São Luís caía no DIA SEGUINTE (e na virada, até no
       mês seguinte). O código novo já grava certo; isto conserta o histórico.

       A regra é cirúrgica — só mexe onde dá pra PROVAR que a data veio do
       relógio errado, nunca em data escolhida à mão no Caixa:
         · data_venda == dia UTC do momento do registro (bate com o default), E
         · o registro aconteceu entre 00h e 02h59 UTC — a única janela em que
           UTC e São Luís divergem.
       Nessa interseção a data certa é exatamente 1 dia antes. Tudo que muda
       fica guardado em fuso_correcao_backup, com a data antiga — reversível. */
    const { rows: [flagFuso] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'correcao_fuso_datas_v1'");
    if (!flagFuso) {
      await query(`CREATE TABLE IF NOT EXISTS fuso_correcao_backup (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tabela TEXT, registro_id TEXT, data_antiga DATE, data_nova DATE,
        created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});

      // O default das colunas também muda pra data de São Luís — cinto de
      // segurança pra qualquer INSERT que não passe pelas rotas corrigidas.
      await query(`ALTER TABLE vendas ALTER COLUMN data_venda SET DEFAULT ((NOW() - interval '3 hours')::date)`).catch(() => {});
      await query(`ALTER TABLE despesas ALTER COLUMN data SET DEFAULT ((NOW() - interval '3 hours')::date)`).catch(() => {});

      let nVendas = 0, nDesp = 0;
      try {
        const r1 = await query(`
          WITH corrigidas AS (
            UPDATE vendas
               SET data_venda = ((created_at AT TIME ZONE 'UTC') - interval '3 hours')::date,
                   updated_at = NOW()
             WHERE created_at IS NOT NULL
               AND data_venda = (created_at AT TIME ZONE 'UTC')::date
               AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') < 3
            RETURNING id, data_venda)
          INSERT INTO fuso_correcao_backup (tabela, registro_id, data_nova, data_antiga)
          SELECT 'vendas', id, data_venda, data_venda + 1 FROM corrigidas`);
        nVendas = r1.rowCount || 0;
      } catch (e) { console.error('correção fuso vendas:', e.message); }
      try {
        const r2 = await query(`
          WITH corrigidas AS (
            UPDATE despesas
               SET data = ((created_at AT TIME ZONE 'UTC') - interval '3 hours')::date
             WHERE created_at IS NOT NULL
               AND data = (created_at AT TIME ZONE 'UTC')::date
               AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') < 3
            RETURNING id, data)
          INSERT INTO fuso_correcao_backup (tabela, registro_id, data_nova, data_antiga)
          SELECT 'despesas', id, data, data + 1 FROM corrigidas`);
        nDesp = r2.rowCount || 0;
      } catch (e) { console.error('correção fuso despesas:', e.message); }

      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
        ['🕰️ Datas corrigidas pro fuso de São Luís',
         `${nVendas} venda(s) e ${nDesp} despesa(s) registradas depois das 21h estavam gravadas no dia seguinte e voltaram pro dia certo. A lista completa (com a data antiga) está guardada — nada foi perdido.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('correcao_fuso_datas_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🕰️ Fuso corrigido no histórico: ${nVendas} venda(s), ${nDesp} despesa(s)`);
    }

    /* 👋 Beatriz e Steicy REMOVIDAS de vez (ordem do master: "retira o usuário").
       Antes era só desativar; agora o cadastro sai da lista. O histórico fica
       intacto: vendas guardam atendente_nome em texto e os vínculos de
       leads/conversas são ON DELETE SET NULL. Uma cópia do cadastro vai pra
       configuracoes (backup_usuarios_removidos) — se o master mudar de ideia,
       dá pra recriar. Nunca toca em master. */
    const { rows: [flagRemove] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_remove_beatriz_steicy_v1'");
    if (!flagRemove) {
      try {
        const { rows: alvos } = await query(`
          SELECT id, nome, email, cpf, role, setor, setores, ativo FROM usuarios
           WHERE role <> 'master'
             AND (regexp_replace(COALESCE(cpf,''),'\\D','','g') IN ('17210177710','62339059313')
                  OR nome ILIKE 'Beatriz dos Santos%' OR nome ILIKE 'Steicy%')`);
        if (alvos.length) {
          const ids = alvos.map(a => a.id);
          await query(`INSERT INTO configuracoes (chave, valor) VALUES ('backup_usuarios_removidos', $1::jsonb)
                       ON CONFLICT (chave) DO UPDATE SET valor = configuracoes.valor || $1::jsonb, updated_at = NOW()`,
            [JSON.stringify(alvos)]);
          // Garante o nome em texto nas vendas antigas antes de apagar o cadastro
          await query(`UPDATE vendas SET atendente_nome = u.nome FROM usuarios u
                        WHERE vendas.atendente_id = u.id AND u.id = ANY($1)
                          AND COALESCE(TRIM(vendas.atendente_nome),'') = ''`, [ids]).catch(() => {});
          await query(`DELETE FROM usuarios WHERE id = ANY($1)`, [ids]);
          console.log(`👋 Removidas de vez: ${alvos.map(a => a.nome).join(', ')}`);
        } else {
          console.log('👋 Beatriz/Steicy: nenhum cadastro encontrado (já removidas?)');
        }
      } catch (e) { console.error('remove Beatriz/Steicy:', e.message); }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_remove_beatriz_steicy_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    /* 🤖 IA DE CONSULTAS LIGADA (ordem do master: "a partir de agora eu quero
       que a IA responda" os atendimentos de consulta). Duas chaves, de propósito:
       · área 'bot' da automação religada — sem ela NADA responde sozinho;
       · config 'bot': consultaIA=true e ativo=false — a Vitta assume SÓ as
         conversas de consultas/terapias; o fluxo automático de vacinas (menu/
         reabertura geral) continua desligado como o master deixou.
       Merge com || (jsonb_set não cria pai ausente e falha calado — já caímos
       nessa). Flag única: se o master desligar depois pelo painel, o próximo
       deploy NÃO religa sozinho. */
    const { rows: [flagIACons] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_consultas_ligada_v1'");
    if (!flagIACons) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('automacao_pausada', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET
                     valor = COALESCE(configuracoes.valor, '{}'::jsonb) ||
                             jsonb_build_object('ligado',
                               COALESCE(configuracoes.valor->'ligado', '{}'::jsonb) || '{"bot":true}'::jsonb,
                               'por', 'Dr Miécio (IA de consultas)', 'em', to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SSZ')),
                     updated_at = NOW()`,
        [JSON.stringify({ ligado: { bot: true, followup: true, lembretes: true, agendadas: false }, por: 'Dr Miécio (IA de consultas)' })]).catch((e) => console.error('seed IA consultas (area):', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('bot', '{"ativo":false,"consultaIA":true}'::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET
                     valor = COALESCE(configuracoes.valor, '{}'::jsonb) || '{"ativo":false,"consultaIA":true}'::jsonb,
                     updated_at = NOW()`).catch((e) => console.error('seed IA consultas (bot):', e.message));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_consultas_ligada_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🤖 IA de CONSULTAS ligada (bot geral de vacinas segue desligado)');
    }

    /* 🔎 DOMINGAS (neuropediatria) e FELIPE COIMBRA (pediatria) — o master
       indicou estes dois atendimentos que deram certo pra Vitta estudar.
       Este seed roda EM PRODUÇÃO (daqui do sandbox não se alcança o banco):
       procura as conversas por nome (sem acento; cai pro cadastro/lead se o
       contato do WhatsApp tiver outro nome), grava o diálogo como
       conversa-exemplo do setor de consultas (o prompt da Vitta lê os 3 mais
       recentes) e conta o resultado ao master pelo sino. */
    const { rows: [flagExDf] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_exemplos_domingas_felipe_v1'");
    if (!flagExDf) {
      const semAcentoSql = (col) => `lower(translate(COALESCE(${col},''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;
      const acharConversa = async (busca) => {
        const like = `%${busca}%`;
        const { rows: [c1] } = await query(`
          SELECT id, contact_name FROM conversas
           WHERE ${semAcentoSql('contact_name')} LIKE $1
           ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, [like]).catch(() => ({ rows: [] }));
        if (c1) return c1;
        const { rows: [c2] } = await query(`
          SELECT c.id, c.contact_name FROM leads l
          JOIN conversas c ON length(regexp_replace(COALESCE(l.telefone,''),'\\D','','g')) >= 8
           AND regexp_replace(COALESCE(c.phone,''),'\\D','','g') LIKE '%' || right(regexp_replace(COALESCE(l.telefone,''),'\\D','','g'), 8)
          WHERE ${semAcentoSql('l.nome')} LIKE $1
          ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1`, [like]).catch(() => ({ rows: [] }));
        return c2 || null;
      };
      const gravarExemplo = async (conv, titulo) => {
        const { rows: msgs } = await query(`
          SELECT from_type, content FROM mensagens
           WHERE conversa_id = $1 AND type = 'text' AND from_type IN ('contact','me','bot')
           ORDER BY created_at ASC LIMIT 120`, [conv.id]).catch(() => ({ rows: [] }));
        if (msgs.length < 4) return false;   // conversa curta demais não ensina nada
        const linhas = msgs.map(m => `${m.from_type === 'contact' ? 'Cliente' : 'Atendente'}: ${String(m.content || '').slice(0, 400)}`);
        const conteudo = linhas.join('\n').slice(0, 6000);
        await query(`INSERT INTO exemplos_conversa (titulo, setor, conteudo, criado_por)
                     VALUES ($1, 'consultas', $2, 'Vitta · pedido do master')`, [titulo, conteudo]);
        return true;
      };
      const resultados = [];
      for (const alvo of [
        { busca: 'domingas', titulo: 'Domingas — Neuropediatria (agendou)' },
        { busca: 'felipe coimbra', busca2: 'coimbra', titulo: 'Felipe Coimbra — Pediatria (agendou)' },
      ]) {
        try {
          let conv = await acharConversa(alvo.busca);
          if (!conv && alvo.busca2) conv = await acharConversa(alvo.busca2);
          if (!conv) { resultados.push(`❌ ${alvo.titulo.split(' — ')[0]}: não achei conversa com esse nome (nem no contato, nem no cadastro).`); continue; }
          const ok = await gravarExemplo(conv, alvo.titulo);
          resultados.push(ok
            ? `✅ ${alvo.titulo.split(' — ')[0]}: achei a conversa de "${conv.contact_name || 'sem nome'}" e gravei como exemplo da Vitta.`
            : `⚠️ ${alvo.titulo.split(' — ')[0]}: achei "${conv.contact_name || 'sem nome'}", mas a conversa tem menos de 4 mensagens de texto — curta demais pra ensinar.`);
        } catch (e) { resultados.push(`⚠️ ${alvo.titulo.split(' — ')[0]}: erro na busca (${e.message}).`); }
      }
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🔎 Busca das conversas Domingas e Felipe Coimbra',
         `${resultados.join('\n')}\n\nAs que foram gravadas já entram no estudo da Vitta (conversas-exemplo de consultas). Depois clique em Gerar/Atualizar a base no Placar → Automático → Cérebro de consultas pra ela absorver tudo.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_exemplos_domingas_felipe_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🔎 Exemplos Domingas/Felipe: ${resultados.join(' | ')}`);
    }

    /* 🔎 v2 — Domingas e Felipe Coimbra COM OS ÁUDIOS. O master mandou o print:
       a Domingas certa é a do telefone (98) 9103-8750, e a conversa tem áudios.
       Esta passada acha pelo TELEFONE (nome falha se o contato do WhatsApp for
       outro), transcreve os áudios pendentes com Whisper e regrava o exemplo
       inteiro (texto + voz). Roda por cima do v1. */
    const { rows: [flagExDf2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_exemplos_domingas_felipe_v2'");
    if (!flagExDf2) {
      const semAc2 = (col) => `lower(translate(COALESCE(${col},''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;
      const resultados2 = [];
      try {
        // Import dinâmico: o módulo das rotas já carrega no boot de qualquer jeito
        const { transcreverAudiosDaConversa } = await import('../routes/inbox.js');
        const gravar2 = async (conv, titulo) => {
          const audios = await transcreverAudiosDaConversa(conv.id, 40).catch(() => ({ transcritos: 0 }));
          const { rows: msgs } = await query(`
            SELECT from_type, type, content, transcricao FROM mensagens
             WHERE conversa_id = $1 AND type IN ('text','audio') AND from_type IN ('contact','me','bot')
             ORDER BY created_at ASC LIMIT 150`, [conv.id]).catch(() => ({ rows: [] }));
          const linhas = msgs.map(m => {
            const quem = m.from_type === 'contact' ? 'Cliente' : 'Atendente';
            const txt = m.type === 'audio'
              ? (String(m.transcricao || '').trim() ? `[áudio] ${String(m.transcricao).trim().slice(0, 400)}` : null)
              : String(m.content || '').slice(0, 400);
            return txt ? `${quem}: ${txt}` : null;
          }).filter(Boolean);
          if (linhas.length < 4) return { ok: false, audios };
          await query('DELETE FROM exemplos_conversa WHERE titulo = $1', [titulo]).catch(() => {});
          await query(`INSERT INTO exemplos_conversa (titulo, setor, conteudo, criado_por)
                       VALUES ($1, 'consultas', $2, 'Vitta · pedido do master')`, [titulo, linhas.join('\n').slice(0, 6000)]);
          return { ok: true, audios };
        };
        // Domingas: pelo telefone do print do master
        const { rows: [convD] } = await query(`
          SELECT id, contact_name FROM conversas
           WHERE regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%91038750%'
           ORDER BY last_message_at DESC NULLS LAST LIMIT 1`).catch(() => ({ rows: [] }));
        if (convD) {
          const r2 = await gravar2(convD, 'Domingas — Neuropediatria (agendou)');
          resultados2.push(r2.ok
            ? `✅ Domingas: conversa de "${convD.contact_name || 'sem nome'}" gravada como exemplo — ${r2.audios.transcritos || 0} áudio(s) transcritos${r2.audios.falhas ? ` (${r2.audios.falhas} áudio(s) não deram)` : ''}.`
            : `⚠️ Domingas: achei a conversa, mas ficou curta demais mesmo com os áudios.`);
        } else resultados2.push('❌ Domingas: não achei conversa com o telefone 9103-8750.');
        // Felipe Coimbra: por nome (contato ou cadastro)
        let convF = null;
        ({ rows: [convF] } = await query(`
          SELECT id, contact_name FROM conversas WHERE ${semAc2('contact_name')} LIKE '%coimbra%'
          ORDER BY last_message_at DESC NULLS LAST LIMIT 1`).catch(() => ({ rows: [] })));
        if (!convF) {
          ({ rows: [convF] } = await query(`
            SELECT c.id, c.contact_name FROM leads l
            JOIN conversas c ON length(regexp_replace(COALESCE(l.telefone,''),'\\D','','g')) >= 8
             AND regexp_replace(COALESCE(c.phone,''),'\\D','','g') LIKE '%' || right(regexp_replace(COALESCE(l.telefone,''),'\\D','','g'), 8)
            WHERE ${semAc2('l.nome')} LIKE '%coimbra%'
            ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1`).catch(() => ({ rows: [] })));
        }
        if (convF) {
          const r3 = await gravar2(convF, 'Felipe Coimbra — Pediatria (agendou)');
          resultados2.push(r3.ok
            ? `✅ Felipe Coimbra: conversa de "${convF.contact_name || 'sem nome'}" gravada como exemplo — ${r3.audios.transcritos || 0} áudio(s) transcritos${r3.audios.falhas ? ` (${r3.audios.falhas} não deram)` : ''}.`
            : `⚠️ Felipe Coimbra: achei a conversa, mas ficou curta demais mesmo com os áudios.`);
        } else resultados2.push('❌ Felipe Coimbra: não achei conversa com "Coimbra" (nem no contato, nem no cadastro).');
      } catch (e) { resultados2.push(`⚠️ Erro na passada: ${e.message}`); }
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🎙️ Domingas e Felipe — agora com os áudios',
         `${resultados2.join('\n')}\n\nOs áudios transcritos aparecem embaixo de cada player na conversa. Agora clique em Atualizar a base (Placar → Automático → 🧠 Cérebro de consultas) pra Vitta absorver tudo — inclusive o que foi falado por voz.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_exemplos_domingas_felipe_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🎙️ Exemplos v2: ${resultados2.join(' | ')}`);
    }

    /* 🔎 v3 — agora com os DOIS telefones exatos (prints do master):
       Domingas (98) 9103-8750 e Felipe Coimbra (98) 8431-6076. Telefone não
       erra homônimo. Transcreve os áudios e regrava os exemplos por cima. */
    const { rows: [flagExDf3] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_exemplos_domingas_felipe_v3'");
    if (!flagExDf3) {
      const resultados3 = [];
      try {
        const { transcreverAudiosDaConversa } = await import('../routes/inbox.js');
        for (const alvo of [
          { tel: '91038750', titulo: 'Domingas — Neuropediatria (agendou)', rotulo: 'Domingas' },
          { tel: '84316076', titulo: 'Felipe Coimbra — Pediatria (agendou)', rotulo: 'Felipe Coimbra' },
        ]) {
          const { rows: [conv] } = await query(`
            SELECT id, contact_name FROM conversas
             WHERE regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || $1
             ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, [alvo.tel]).catch(() => ({ rows: [] }));
          if (!conv) { resultados3.push(`❌ ${alvo.rotulo}: nenhuma conversa com final ${alvo.tel}.`); continue; }
          const audios = await transcreverAudiosDaConversa(conv.id, 40).catch(() => ({ transcritos: 0, falhas: 0 }));
          const { rows: msgs } = await query(`
            SELECT from_type, type, content, transcricao FROM mensagens
             WHERE conversa_id = $1 AND type IN ('text','audio') AND from_type IN ('contact','me','bot')
             ORDER BY created_at ASC LIMIT 150`, [conv.id]).catch(() => ({ rows: [] }));
          const linhas = msgs.map(m => {
            const quem = m.from_type === 'contact' ? 'Cliente' : 'Atendente';
            const txt = m.type === 'audio'
              ? (String(m.transcricao || '').trim() ? `[áudio] ${String(m.transcricao).trim().slice(0, 400)}` : null)
              : String(m.content || '').slice(0, 400);
            return txt ? `${quem}: ${txt}` : null;
          }).filter(Boolean);
          if (linhas.length < 4) { resultados3.push(`⚠️ ${alvo.rotulo}: achei "${conv.contact_name || 'sem nome'}", mas a conversa ficou curta demais mesmo com os áudios.`); continue; }
          await query('DELETE FROM exemplos_conversa WHERE titulo = $1', [alvo.titulo]).catch(() => {});
          await query(`INSERT INTO exemplos_conversa (titulo, setor, conteudo, criado_por)
                       VALUES ($1, 'consultas', $2, 'Vitta · pedido do master')`, [alvo.titulo, linhas.join('\n').slice(0, 6000)]);
          resultados3.push(`✅ ${alvo.rotulo}: "${conv.contact_name || 'sem nome'}" gravada como treinamento — ${audios.transcritos || 0} áudio(s) transcritos${audios.falhas ? ` (${audios.falhas} não deram)` : ''}.`);
        }
      } catch (e) { resultados3.push(`⚠️ Erro na passada: ${e.message}`); }
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🎓 Treinamento da Vitta: Domingas e Felipe (pelos telefones)',
         `${resultados3.join('\n')}\n\nEssas conversas agora são estudadas pela Vitta em TODA resposta de consultas. Falta 1 clique seu: Placar → ⚙️ Automático → 🧠 Cérebro de consultas → Atualizar a base — aí ela absorve tudo no manual de fechamento.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_exemplos_domingas_felipe_v3','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🎓 Exemplos v3: ${resultados3.join(' | ')}`);
    }

    /* 🤖 IA DE CONSULTAS — SÓ PRA QUEM É DE CONSULTAS (ordem do master):
       Danielle, Stefany e Mayara são as três que trabalham consultas e não
       estão convertendo — a Vitta entra como reforço DELAS. A flag por usuária
       controla quem vê o convite/botão da IA no Chat (o master sempre vê). */
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ia_consultas BOOLEAN DEFAULT false`).catch(() => {});
    // Chave PESSOAL da IA: cada usuária liga/desliga a Mary nas conversas DELA,
    // sem afetar as colegas (pedido do master: "não quero que isso crie conflito")
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ia_ligada BOOLEAN DEFAULT true`).catch(() => {});
    /* 👥 EQUIPE DA SUPERVISORA (pedido do master): quem tem supervisor_id
       trabalha DEBAIXO daquela supervisora. Com equipe cadastrada, a
       supervisora vira a triagem do setor: TODOS os leads novos caem com ela
       e ela transfere pra quem escolher (Danielle: consultas/terapias). */
    await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS supervisor_id TEXT`).catch(() => {});
    const { rows: [flagTrioIA] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_consultas_trio_v1'");
    if (!flagTrioIA) {
      const rTrio = await query(`UPDATE usuarios SET ia_consultas = true, updated_at = NOW()
                                  WHERE ativo = true AND role <> 'master'
                                    AND (nome ILIKE 'danielle%' OR nome ILIKE 'stefany%' OR nome ILIKE 'stephanie%' OR nome ILIKE 'mayara%')`)
        .catch(() => ({ rowCount: 0 }));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_consultas_trio_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🤖 IA de consultas liberada pra ${rTrio.rowCount || 0} usuária(s): Danielle, Stefany e Mayara`);
    }

    /* 🤖 "e pra dra tbm" (master): libera a Vitta também pra quem tem "Dra"/
       "Doutora" no começo do nome. Regex ancorada no INÍCIO de propósito —
       '%dra%' pegaria Sandra e Alessandra. Se não achar ninguém, o sino avisa
       e o master marca pela tela (Configurações → Usuários → chave 🤖). */
    const { rows: [flagDraIA] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_consultas_dra_v1'");
    if (!flagDraIA) {
      const { rows: dras } = await query(`UPDATE usuarios SET ia_consultas = true, updated_at = NOW()
                                           WHERE ativo = true AND role <> 'master'
                                             AND nome ~* '^(dra\\.?|doutora)\\s'
                                           RETURNING nome`).catch(() => ({ rows: [] }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🤖 Vitta liberada pra Dra',
         dras.length
           ? `Chave da Vitta ligada pra: ${dras.map(d => d.nome).join(', ')}. Ela(s) já vê(em) o convite roxo nas conversas de consultas.`
           : 'Procurei uma usuária com "Dra"/"Doutora" no começo do nome e não achei. Liga pela tela: Configurações → Usuários → editar a pessoa → chave "🤖 Vitta nas consultas" — ou me diz o nome exato que eu ligo.']).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_consultas_dra_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🤖 Vitta pra Dra: ${dras.length ? dras.map(d => d.nome).join(', ') : 'ninguém com Dra no nome — master marca pela tela'}`);
    }

    /* 🧠 PRIMEIRO TREINO AUTOMÁTICO (pergunta do master: "consegue treinar o
       chatbot de forma excelente?"). Sem esperar clique: 45s depois do boot —
       com o servidor de pé e os seeds dos exemplos já gravados — a Vitta gera
       o manual sozinha e conta o resultado no sino. Só roda se ainda não
       existe base (nunca sobrescreve uma que a gestão gerou). */
    const { rows: [flagAutoBase] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_base_consultas_auto_v1'");
    if (!flagAutoBase) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_base_consultas_auto_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      setTimeout(async () => {
        try {
          const { rows: [jaTem] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'vitta_base_consultas' AND COALESCE(valor->>'texto','') <> ''");
          if (jaTem) return;
          const { gerarBaseConsultas } = await import('../routes/inbox.js');
          const out = await gerarBaseConsultas('Vitta (primeiro treino automático)');
          await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
            ['🧠 Vitta treinada — primeiro treino automático',
             out.error
               ? `Tentei gerar a base de consultas sozinha, mas: ${out.error}`
               : `A base de consultas foi gerada sozinha com ${out.conversas} conversa(s) que deram certo, ${out.itens_tabela} preço(s) da tabela e ${out.profissionais} profissional(is). A Vitta já responde com esse manual. Pra re-treinar quando quiser: Placar → ⚙️ Automático → 🧠 Atualizar a base.`]).catch(() => {});
          console.log('🧠 Primeiro treino automático:', out.error || `ok (${out.conversas} conversas)`);
        } catch (e) { console.error('primeiro treino automático:', e.message); }
      }, 45000);
    }

    /* 🤖 Suellen também com a Vitta (ordem do master: "Danielle, Suelen e
       Mayara"). Stefany fica ligada — foi pedida antes e não houve ordem de
       tirar; a chave na tela de Usuários resolve em 1 clique se ele quiser.
       O sino confirma a lista completa de quem está com a IA. */
    const { rows: [flagSuellenIA] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_consultas_suellen_v1'");
    if (!flagSuellenIA) {
      await query(`UPDATE usuarios SET ia_consultas = true, updated_at = NOW()
                    WHERE ativo = true AND role <> 'master' AND (nome ILIKE 'suellen%' OR nome ILIKE 'suelen%')`).catch(() => {});
      const { rows: comIA } = await query(`SELECT nome FROM usuarios WHERE ativo = true AND ia_consultas = true ORDER BY nome`).catch(() => ({ rows: [] }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🤖 Vitta ativada — lista atualizada',
         comIA.length
           ? `A Vitta está ativa pra: ${comIA.map(u => u.nome.split(' ')[0]).join(', ')}. Elas veem o convite roxo nas conversas de consultas/terapias — um toque e a Vitta assume rumo ao agendamento. Pra ligar/desligar alguém: Configurações → Usuários → chave 🤖.`
           : 'Não achei nenhuma usuária com a chave ligada — confira em Configurações → Usuários.']).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_consultas_suellen_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🤖 Vitta liberada pra Suellen (lista completa no sino do master)');
    }

    /* 🤖 ORDEM FINAL DO MASTER ("não esqueça: somente elas"): a chave da Vitta
       fica SÓ com Danielle, Suellen e Mayara — quem mais estiver com ela perde
       (Stefany/Dra saem se estavam). E "de início quem está ligada é a IA":
       liga a Vitta nas conversas de consultas/terapias que não têm atendente
       falando nas últimas 24h (atendimento em curso ninguém atropela). */
    const { rows: [flagSoTrio] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_somente_trio_v1'");
    if (!flagSoTrio) {
      const ehTrio = "(nome ILIKE 'danielle%' OR nome ILIKE 'suellen%' OR nome ILIKE 'suelen%' OR nome ILIKE 'mayara%')";
      await query(`UPDATE usuarios SET ia_consultas = false, updated_at = NOW() WHERE ia_consultas = true AND NOT ${ehTrio}`).catch(() => {});
      await query(`UPDATE usuarios SET ia_consultas = true, updated_at = NOW() WHERE ativo = true AND role <> 'master' AND ${ehTrio}`).catch(() => {});
      const { rows: comIA } = await query(`SELECT nome FROM usuarios WHERE ativo = true AND ia_consultas = true ORDER BY nome`).catch(() => ({ rows: [] }));
      const rLiga = await query(`
        UPDATE conversas c SET bot_ativo = true
         WHERE setor IN ('consultas','terapias') AND COALESCE(bot_ativo, false) = false
           AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa_id = c.id
                             AND m.from_type = 'me' AND m.created_at > NOW() - interval '24 hours')`).catch(() => ({ rowCount: 0 }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🤖 Vitta — do jeito que o senhor mandou',
         `Chave da Vitta SOMENTE com: ${comIA.map(u => u.nome.split(' ')[0]).join(', ') || 'ninguém (confira os nomes)'}.\n` +
         `A IA já entrou LIGADA em ${rLiga.rowCount || 0} conversa(s) de consultas/terapias (as com atendente falando nas últimas 24h ficaram de fora).\n` +
         `Elas ligam e desligam pelo botão na própria conversa — e classificar uma conversa pra consultas já liga a Vitta sozinha.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_somente_trio_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🤖 Vitta somente com o trio; ligada em ${rLiga.rowCount || 0} conversa(s)`);
    }

    /* 🧵 COSTURA RETROATIVA DOS CASES (master: "você não trouxe todos os
       agendamentos... tenta puxar do caixa"). Agendamento e venda antigos
       foram gravados SEM o vínculo com a conversa — e case sem conversa não
       existe. Dois casamentos, do mais seguro pro mais cauteloso:
       · agendamentos ↔ conversas pelo TELEFONE (últimos 8 dígitos);
       · vendas do Caixa ↔ conversas pelo NOME COMPLETO sem acento, e SÓ
         quando bate com exatamente UMA conversa (homônimo fica de fora —
         vincular errado seria pôr a conversa de um cliente no case de outro). */
    const { rows: [flagCostura] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_vincula_cases_v1'");
    if (!flagCostura) {
      let nAgd = 0, nVen = 0;
      try {
        const r1 = await query(`
          WITH cand AS (
            SELECT DISTINCT ON (a.id) a.id aid, c.id cid
            FROM agenda_eventos a
            JOIN conversas c
              ON right(regexp_replace(COALESCE(c.phone,''),'\\D','','g'), 8)
               = right(regexp_replace(COALESCE(a.telefone,''),'\\D','','g'), 8)
            WHERE a.conversa_id IS NULL
              AND length(regexp_replace(COALESCE(a.telefone,''),'\\D','','g')) >= 8
              AND length(regexp_replace(COALESCE(c.phone,''),'\\D','','g')) >= 8
            ORDER BY a.id, c.last_message_at DESC NULLS LAST)
          UPDATE agenda_eventos a SET conversa_id = cand.cid FROM cand WHERE a.id = cand.aid`);
        nAgd = r1.rowCount || 0;
      } catch (e) { console.error('costura agendamentos:', e.message); }
      try {
        const norm = (col) => `lower(translate(COALESCE(${col},''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;
        const r2 = await query(`
          WITH v AS (
            SELECT id, ${norm('cliente_nome')} nome FROM vendas
             WHERE conversa_id IS NULL AND length(TRIM(COALESCE(cliente_nome,''))) >= 5),
          c AS (
            SELECT id, ${norm('contact_name')} nome FROM conversas
             WHERE length(TRIM(COALESCE(contact_name,''))) >= 5),
          unicos AS (
            SELECT v.id vid, MIN(c.id) cid FROM v JOIN c ON c.nome = v.nome
            GROUP BY v.id HAVING COUNT(DISTINCT c.id) = 1)
          UPDATE vendas SET conversa_id = unicos.cid FROM unicos WHERE vendas.id = unicos.vid`);
        nVen = r2.rowCount || 0;
      } catch (e) { console.error('costura vendas:', e.message); }
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🧵 Cases costurados com o histórico',
         `${nAgd} agendamento(s) antigos ganharam o vínculo com a conversa (casados pelo telefone) e ${nVen} venda(s) do Caixa foram casadas pelo nome do cliente (só quando batia com UMA conversa — homônimo ficou de fora, por segurança).\n\nOs Cases de Sucesso agora mostram esse histórico todo — e o treinamento da Vitta (Atualizar a base) passa a beber dele também. Vendas/agendamentos que ficaram de fora são os digitados sem telefone/nome que exista no Chat.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_vincula_cases_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🧵 Costura dos cases: ${nAgd} agendamentos + ${nVen} vendas vinculados`);
    }

    /* 🧵 v2 — "não trouxe todos do caixa" (master). A v1 só casava pelo nome
       EXATO do cliente; muita venda do Caixa tem o nome do PACIENTE, nome
       incompleto, ou só o cadastro (lead) ligado. Quatro camadas agora, da
       mais firme pra mais flexível — e o que sobrar sem par vai LISTADO no
       sino, porque "não deu" tem que ser visível, não silencioso. */
    const { rows: [flagCostura2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_vincula_cases_v2'");
    if (!flagCostura2) {
      const norm2 = (col) => `lower(translate(COALESCE(${col},''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;
      const dig = (col) => `regexp_replace(COALESCE(${col},''),'\\D','','g')`;
      let liga = { lead: 0, telLead: 0, nome: 0, nomeLead: 0 };
      // a) venda e conversa apontam pro MESMO cadastro (lead)
      try {
        const r = await query(`
          WITH cand AS (
            SELECT DISTINCT ON (v.id) v.id vid, c.id cid
            FROM vendas v JOIN conversas c ON c.lead_id IS NOT NULL AND c.lead_id::text = v.lead_id::text
            WHERE v.conversa_id IS NULL AND v.lead_id IS NOT NULL
            ORDER BY v.id, c.last_message_at DESC NULLS LAST)
          UPDATE vendas v SET conversa_id = cand.cid FROM cand WHERE v.id = cand.vid`);
        liga.lead = r.rowCount || 0;
      } catch (e) { console.error('costura v2 lead:', e.message); }
      // b) telefone do cadastro da venda → conversa
      try {
        const r = await query(`
          WITH cand AS (
            SELECT DISTINCT ON (v.id) v.id vid, c.id cid
            FROM vendas v
            JOIN leads l ON l.id::text = v.lead_id::text
            JOIN conversas c ON length(${dig('l.telefone')}) >= 8
              AND right(${dig('c.phone')}, 8) = right(${dig('l.telefone')}, 8)
            WHERE v.conversa_id IS NULL AND v.lead_id IS NOT NULL
            ORDER BY v.id, c.last_message_at DESC NULLS LAST)
          UPDATE vendas v SET conversa_id = cand.cid FROM cand WHERE v.id = cand.vid`);
        liga.telLead = r.rowCount || 0;
      } catch (e) { console.error('costura v2 tel-lead:', e.message); }
      // c) nome flexível: cliente OU paciente, um começa com o outro, par ÚNICO
      try {
        const r = await query(`
          WITH v AS (
            SELECT id, ${norm2('cliente_nome')} n1, ${norm2('paciente_nome')} n2 FROM vendas WHERE conversa_id IS NULL),
          c AS (
            SELECT id, ${norm2('contact_name')} nome FROM conversas WHERE length(TRIM(COALESCE(contact_name,''))) >= 5),
          m AS (
            SELECT v.id vid, c.id cid FROM v JOIN c ON
                 (length(v.n1) >= 5 AND (c.nome LIKE v.n1 || '%' OR v.n1 LIKE c.nome || '%'))
              OR (length(v.n2) >= 5 AND (c.nome LIKE v.n2 || '%' OR v.n2 LIKE c.nome || '%'))),
          unicos AS (SELECT vid, MIN(cid) cid FROM m GROUP BY vid HAVING COUNT(DISTINCT cid) = 1)
          UPDATE vendas v SET conversa_id = unicos.cid FROM unicos WHERE v.id = unicos.vid`);
        liga.nome = r.rowCount || 0;
      } catch (e) { console.error('costura v2 nome:', e.message); }
      // d) nome da venda → cadastro (lead) → telefone → conversa, par ÚNICO
      try {
        const r = await query(`
          WITH v AS (
            SELECT id, ${norm2('cliente_nome')} n1, ${norm2('paciente_nome')} n2 FROM vendas WHERE conversa_id IS NULL),
          m AS (
            SELECT v.id vid, c.id cid
            FROM v
            JOIN leads l ON (length(v.n1) >= 5 AND (${norm2('l.nome')} LIKE v.n1 || '%' OR v.n1 LIKE ${norm2('l.nome')} || '%'))
                         OR (length(v.n2) >= 5 AND (${norm2('l.nome')} LIKE v.n2 || '%' OR v.n2 LIKE ${norm2('l.nome')} || '%'))
            JOIN conversas c ON length(${dig('l.telefone')}) >= 8
              AND right(${dig('c.phone')}, 8) = right(${dig('l.telefone')}, 8)),
          unicos AS (SELECT vid, MIN(cid) cid FROM m GROUP BY vid HAVING COUNT(DISTINCT cid) = 1)
          UPDATE vendas v SET conversa_id = unicos.cid FROM unicos WHERE v.id = unicos.vid`);
        liga.nomeLead = r.rowCount || 0;
      } catch (e) { console.error('costura v2 nome-lead:', e.message); }
      // Relatório honesto: o que AINDA ficou órfão, com nome e data
      const { rows: orfas } = await query(`
        SELECT COALESCE(NULLIF(TRIM(cliente_nome),''), NULLIF(TRIM(paciente_nome),''), '(sem nome)') nome, data_venda, valor
          FROM vendas WHERE conversa_id IS NULL ORDER BY data_venda DESC LIMIT 15`).catch(() => ({ rows: [] }));
      const { rows: [{ n: totalOrfas }] } = await query('SELECT COUNT(*)::int n FROM vendas WHERE conversa_id IS NULL').catch(() => ({ rows: [{ n: 0 }] }));
      const total2 = liga.lead + liga.telLead + liga.nome + liga.nomeLead;
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🧵 Caixa → Cases: segunda costura',
         `Mais ${total2} venda(s) do Caixa ganharam a conversa (${liga.lead} pelo cadastro, ${liga.telLead} pelo telefone do cadastro, ${liga.nome} pelo nome, ${liga.nomeLead} pelo nome via cadastro).\n\n` +
         (totalOrfas > 0
           ? `Ficaram ${totalOrfas} venda(s) sem par — sem telefone e sem nome que exista no Chat. As mais recentes: ${orfas.map(o => `${o.nome} (${o.data_venda ? String(o.data_venda).slice(0, 10) : 's/ data'})`).join(', ')}. Essas não têm como virar case: a conversa delas não está no sistema.`
           : 'Nenhuma venda ficou órfã — o Caixa inteiro está ligado às conversas. 🎉')]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_vincula_cases_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🧵 Costura v2: +${total2} vendas ligadas; ${totalOrfas} órfãs`);
    }

    /* 📨 BOM-DIA DA VITTA (pedido do master: "programa a IA mandar mensagem
       para os clientes às 8:00"). As 8:00 de 20/08 já tinham passado quando o
       pedido chegou → agendado pra PRÓXIMA 8:00 da manhã: 21/08 às 8:00 de
       São Luís (11:00 UTC). Alvo: as conversas de consultas/terapias em que a
       Vitta está de plantão (bot ligado), sem mensagem nossa nas últimas 24h.
       Tudo fica VISÍVEL na fila de mensagens automáticas — dá pra cancelar
       qualquer uma antes das 8h. A fila agendada é religada aqui (o pedido é
       exatamente um envio programado). */
    const { rows: [flagBomDia] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_bomdia_vitta_21ago_v1'");
    if (!flagBomDia) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('automacao_pausada', '{"ligado":{"agendadas":true}}'::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET
                     valor = COALESCE(configuracoes.valor, '{}'::jsonb) ||
                             jsonb_build_object('ligado', COALESCE(configuracoes.valor->'ligado', '{}'::jsonb) || '{"agendadas":true}'::jsonb),
                     updated_at = NOW()`).catch((e) => console.error('religa agendadas:', e.message));
      const rBom = await query(`
        INSERT INTO mensagens_agendadas (conversa_id, texto, enviar_em, criado_por)
        SELECT c.id,
               'Bom dia' || CASE WHEN TRIM(COALESCE(c.contact_name,'')) <> '' THEN ', ' || split_part(TRIM(c.contact_name), ' ', 1) ELSE '' END ||
               '! 💙 Aqui é a Mary, da Vittalis Saúde. Passei pra saber como vocês estão por aí 😊 Se estiver precisando de consulta ou de uma avaliação pro seu pequeno, me conta que eu já vejo um horário certinho pra vocês!',
               '2026-08-21T11:00:00Z', 'Vitta · Bom dia consultas'
          FROM conversas c
         WHERE c.setor IN ('consultas','terapias') AND c.bot_ativo = true
           /* Somente as carteiras das usuárias que o master sinalizou
              (Danielle, Suellen, Mayara) — a própria chave da Vitta filtra */
           AND c.responsavel_id IN (SELECT id FROM usuarios WHERE ia_consultas = true AND ativo = true)
           AND length(regexp_replace(COALESCE(c.phone,''),'\\D','','g')) >= 8
           AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa_id = c.id
                             AND m.from_type IN ('me','bot') AND m.created_at > NOW() - interval '24 hours')
           AND NOT EXISTS (SELECT 1 FROM mensagens_agendadas ma WHERE ma.conversa_id = c.id AND ma.status = 'pendente' AND ma.criado_por = 'Vitta · Bom dia consultas')
         LIMIT 300`).catch((e) => { console.error('bom-dia insert:', e.message); return { rowCount: 0 }; });
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['📨 Bom-dia da Vitta programado — 21/08 às 8:00',
         `${rBom.rowCount || 0} mensagem(ns) de bom-dia programadas pras conversas de consultas/terapias em que a Vitta está de plantão (as 8:00 de hoje 20/08 já tinham passado quando o pedido chegou — foi pra próxima manhã). Cada uma sai com o nome do cliente, e a Vitta continua acordada pra responder quem responder. Pra revisar ou cancelar qualquer uma antes da hora: fila de mensagens automáticas (Vitta trabalhando). A fila agendada foi religada pra esse envio.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_bomdia_vitta_21ago_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`📨 Bom-dia da Vitta: ${rBom.rowCount || 0} mensagens programadas pra 21/08 8:00 SLZ`);
    }

    /* 💁‍♀️ A IA agora se chama MARY pro cliente (pedido do master; os botões
       do sistema continuam "Vitta"). Corrige os bons-dias JÁ agendados que
       ainda diziam "Aqui é a Vitta". */
    const { rows: [flagMary] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_mary_bomdia_v1'");
    if (!flagMary) {
      const rM = await query(`UPDATE mensagens_agendadas SET texto = replace(texto, 'Aqui é a Vitta', 'Aqui é a Mary')
                               WHERE status = 'pendente' AND texto LIKE '%Aqui é a Vitta%'`).catch(() => ({ rowCount: 0 }));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_mary_bomdia_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`💁‍♀️ Mary: ${rM.rowCount || 0} bom-dia(s) pendentes atualizados`);
    }

    /* 🤖 Raylane e Stefany também ganham o BOTÃO da IA (pedido do master:
       "cada usuário pode ligar e desligar"). Nas conversas delas (vacinas) a
       Mary só entra quando ELAS ligarem, conversa a conversa — nada muda no
       automático de vacinas, que segue desligado. */
    const { rows: [flagVacIA] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_botao_raylane_stefany_v1'");
    if (!flagVacIA) {
      await query(`UPDATE usuarios SET ia_consultas = true, updated_at = NOW()
                    WHERE ativo = true AND role <> 'master' AND (nome ILIKE 'raylane%' OR nome ILIKE 'stefany%' OR nome ILIKE 'stephanie%')`).catch(() => {});
      const { rows: comIA2 } = await query(`SELECT nome FROM usuarios WHERE ativo = true AND ia_consultas = true ORDER BY nome`).catch(() => ({ rows: [] }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🤖 Botão da IA — lista atualizada',
         `Agora têm o botão da Mary: ${comIA2.map(u => u.nome.split(' ')[0]).join(', ') || '(ninguém — confira os nomes)'}. Nas conversas de vacinas ela só entra quando a atendente LIGAR na conversa — o automático de vacinas continua desligado. Em consultas/terapias segue como estava: ligada de início.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_botao_raylane_stefany_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🤖 Botão da IA liberado pra Raylane e Stefany');
    }

    /* 🤖 Garantia final das chaves da IA (master avisou que o botão "sumiu"
       pra Danielle e Stefany): reafirma as CINCO de uma vez e confirma no
       sino. Rodar de novo não faz mal — só liga quem deveria estar ligada. */
    const { rows: [flagCinco] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_flags_cinco_v1'");
    if (!flagCinco) {
      await query(`UPDATE usuarios SET ia_consultas = true, updated_at = NOW()
                    WHERE ativo = true AND role <> 'master'
                      AND (nome ILIKE 'danielle%' OR nome ILIKE 'suellen%' OR nome ILIKE 'suelen%'
                        OR nome ILIKE 'mayara%' OR nome ILIKE 'raylane%' OR nome ILIKE 'stefany%' OR nome ILIKE 'stephanie%')`).catch(() => {});
      const { rows: cinco } = await query(`SELECT nome, ia_ligada FROM usuarios WHERE ativo = true AND ia_consultas = true ORDER BY nome`).catch(() => ({ rows: [] }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🤖 Botão da Mary — confirmação',
         `Com o botão agora: ${cinco.map(u => `${u.nome.split(' ')[0]}${u.ia_ligada === false ? ' (chave pessoal desligada)' : ''}`).join(', ') || 'ninguém — me avise!'}. O botão aparece em TODA conversa (mesmo sem setor classificado). Painel geral: menu → Mary (IA).`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_flags_cinco_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🤖 Chaves da IA reafirmadas pras cinco (${cinco.length} com o botão)`);
    }

    // 💁‍♀️ Mensagens antigas da IA ainda assinavam "Vitta" — viram "Mary"
    const { rows: [flagMary2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_mary_retroativo_v1'");
    if (!flagMary2) {
      const rMr = await query(`UPDATE mensagens SET sender_nome = 'Mary' WHERE from_type = 'bot' AND sender_nome = 'Vitta'`).catch(() => ({ rowCount: 0 }));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_mary_retroativo_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`💁‍♀️ Mary retroativa: ${rMr.rowCount || 0} mensagens antigas renomeadas`);
    }

    /* 🧽 FICHA LIMPA: a captura já gravou nome de GRUPO/EMPRESA como paciente
       ("Terapias Vittalis", "Logística Vittalis" — prints do master). Limpa
       retroativamente na memória das conversas; daqui pra frente o
       mergeMemoria rejeita esses nomes na entrada. */
    const { rows: [flagFicha] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ficha_limpa_v1'");
    if (!flagFicha) {
      const RE_CORP = 'vittalis|log[ií]stic|cl[ií]nica|consult[óo]rio|ltda|cnpj|-group|grupo|equipe|suporte|atendimento';
      const r1 = await query(`UPDATE conversas SET memoria = memoria - 'paciente'
                               WHERE memoria ? 'paciente' AND memoria->>'paciente' ~* $1`, [RE_CORP]).catch(() => ({ rowCount: 0 }));
      const r2 = await query(`UPDATE conversas SET memoria = memoria - 'responsavel'
                               WHERE memoria ? 'responsavel' AND memoria->>'responsavel' ~* $1`, [RE_CORP]).catch(() => ({ rowCount: 0 }));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ficha_limpa_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🧽 Ficha limpa: ${r1.rowCount || 0} paciente(s) e ${r2.rowCount || 0} responsável(is) corporativos removidos da memória`);
    }

    /* 🧩 PLANOS MENSAIS DE TERAPIAS (regra do master): R$ 200 por sessão —
       plano mensal de N sessões custa N × 200 (2 sessões = R$400, 3 = R$600…
       até 40 = R$8.000). Entram na aba Terapias da Tabela de Preços como
       itens clicáveis (passos usuais até 10, depois marcos), e a regra
       completa vive no prompt da Mary. Merge preservando o que já existe. */
    const { rows: [flagPlanosT] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_planos_terapias_v1'");
    if (!flagPlanosT) {
      try {
        const { rows: [tpCfg] } = await query("SELECT valor FROM configuracoes WHERE chave = 'tabela_precos_consultas'");
        const atuais = Array.isArray(tpCfg?.valor?.itens) ? tpCfg.valor.itens : [];
        const nomes = new Set(atuais.map(i => String(i.nome || '').toLowerCase()));
        const sessoes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20, 24, 28, 32, 36, 40];
        const novos = [];
        for (const n of sessoes) {
          const nome = `Plano Mensal — ${n} sessões/mês`;
          if (nomes.has(nome.toLowerCase())) continue;
          novos.push({ id: Math.random().toString(36).slice(2, 10), nome, valor: n * 200,
            categoria: 'Planos Mensais', setor: 'terapias', obs: 'R$ 200 por sessão' });
        }
        if (novos.length) {
          const valorNovo = { ...(tpCfg?.valor || {}), itens: [...atuais, ...novos], por: 'Dr. Miécio (planos de terapias)', em: new Date().toISOString() };
          await query(`INSERT INTO configuracoes (chave, valor) VALUES ('tabela_precos_consultas', $1::jsonb)
                       ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify(valorNovo)]);
        }
        await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
          ['🧩 Planos Mensais de Terapias cadastrados',
           `${novos.length} plano(s) entraram na aba Terapias da Tabela de Preços (R$ 200/sessão: 2 sessões = R$ 400 … 40 sessões = R$ 8.000). A Mary aprendeu a regra completa e o orçamento em cliques já monta qualquer plano. Valores editáveis na própria tabela.`]).catch(() => {});
        console.log(`🧩 Planos de terapias: ${novos.length} itens adicionados`);
      } catch (e) { console.error('seed planos terapias:', e.message); }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_planos_terapias_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    /* 🧩 v2 — a regra vale pra TODAS as especialidades (master): a observação
       dos planos passa a dizer isso pra equipe também. */
    const { rows: [flagPlanosT2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_planos_terapias_v2'");
    if (!flagPlanosT2) {
      try {
        const { rows: [tpC2] } = await query("SELECT valor FROM configuracoes WHERE chave = 'tabela_precos_consultas'");
        const itens2 = Array.isArray(tpC2?.valor?.itens) ? tpC2.valor.itens : [];
        let mudou = 0;
        for (const it of itens2) {
          if (it.categoria === 'Planos Mensais' && (it.setor || 'consultas') === 'terapias') {
            it.obs = 'R$ 200/sessão · qualquer especialidade (Fono, T.O., ABA, Psico, Psicomotricidade, Neuropsico, Nutri…) — pode combinar';
            mudou++;
          }
        }
        if (mudou) {
          await query(`INSERT INTO configuracoes (chave, valor) VALUES ('tabela_precos_consultas', $1::jsonb)
                       ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
            [JSON.stringify({ ...(tpC2?.valor || {}), itens: itens2 })]);
        }
        console.log(`🧩 Planos v2: ${mudou} itens com a observação de especialidades`);
      } catch (e) { console.error('seed planos terapias v2:', e.message); }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_planos_terapias_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    // 🧩 v3 — "no lugar de barra mês coloca por mês" (master): renomeia os planos
    const { rows: [flagPlanosT3] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_planos_terapias_v3'");
    if (!flagPlanosT3) {
      try {
        const { rows: [tpC3] } = await query("SELECT valor FROM configuracoes WHERE chave = 'tabela_precos_consultas'");
        const itens3 = Array.isArray(tpC3?.valor?.itens) ? tpC3.valor.itens : [];
        let mudou3 = 0;
        for (const it of itens3) {
          if (typeof it.nome === 'string' && it.nome.includes('sessões/mês')) {
            it.nome = it.nome.replace('sessões/mês', 'sessões por mês');
            mudou3++;
          }
        }
        if (mudou3) {
          await query(`INSERT INTO configuracoes (chave, valor) VALUES ('tabela_precos_consultas', $1::jsonb)
                       ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
            [JSON.stringify({ ...(tpC3?.valor || {}), itens: itens3 })]);
        }
        console.log(`🧩 Planos v3: ${mudou3} itens renomeados pra "por mês"`);
      } catch (e) { console.error('seed planos terapias v3:', e.message); }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_planos_terapias_v3','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    // 🧩 v4 — plano começa de 1 sessão por mês (R$ 200), degraus de R$ 200
    const { rows: [flagPlanosT4] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_planos_terapias_v4'");
    if (!flagPlanosT4) {
      try {
        const { rows: [tpC4] } = await query("SELECT valor FROM configuracoes WHERE chave = 'tabela_precos_consultas'");
        const itens4 = Array.isArray(tpC4?.valor?.itens) ? tpC4.valor.itens : [];
        const ja1 = itens4.some(i => String(i.nome || '').toLowerCase().includes('1 sessão por mês'));
        if (!ja1) {
          itens4.push({ id: Math.random().toString(36).slice(2, 10), nome: 'Plano Mensal — 1 sessão por mês', valor: 200,
            categoria: 'Planos Mensais', setor: 'terapias',
            obs: 'R$ 200/sessão · qualquer especialidade (Fono, T.O., ABA, Psico, Psicomotricidade, Neuropsico, Nutri…) — pode combinar' });
          await query(`INSERT INTO configuracoes (chave, valor) VALUES ('tabela_precos_consultas', $1::jsonb)
                       ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
            [JSON.stringify({ ...(tpC4?.valor || {}), itens: itens4 })]);
          console.log('🧩 Planos v4: item de 1 sessão por mês adicionado');
        }
      } catch (e) { console.error('seed planos terapias v4:', e.message); }
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_planos_terapias_v4','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    /* 📚 FOTOS DA NÁGILA → BIBLIOTECA (pedido do master): pega as fotos
       recentes (48h) da conversa da Nágila e salva como prova social de
       terapias. Fotos em URL do WhatsApp são baixadas pelo servidor. */
    const { rows: [flagNagila] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_fotos_nagila_v1'");
    if (!flagNagila) {
      let resNagila = '';
      try {
        // Telefone exato do print do master (559891992025) — nome só de reserva
        let { rows: [convN] } = await query(`
          SELECT id, contact_name FROM conversas
           WHERE regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%91992025'
           ORDER BY last_message_at DESC NULLS LAST LIMIT 1`);
        if (!convN) {
          ({ rows: [convN] } = await query(`
            SELECT id, contact_name FROM conversas
             WHERE lower(translate(COALESCE(contact_name,''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE '%nagila%'
             ORDER BY last_message_at DESC NULLS LAST LIMIT 1`));
        }
        if (!convN) { resNagila = '❌ Não achei conversa com "Nágila".'; }
        else {
          const { rows: fotos } = await query(`
            SELECT id, content FROM mensagens
             WHERE conversa_id = $1 AND type = 'image' AND COALESCE(content,'') <> ''
               AND created_at > NOW() - interval '7 days'
             ORDER BY created_at DESC LIMIT 15`, [convN.id]);
          if (!fotos.length) { resNagila = `⚠️ Achei a conversa de "${convN.contact_name}", mas nenhuma foto nos últimos 7 dias.`; }
          else {
            const { default: fetch } = await import('node-fetch');
            let okN = 0, falN = 0;
            for (let i = 0; i < fotos.length; i++) {
              try {
                const src = String(fotos[i].content);
                let mime, b64;
                if (src.startsWith('data:image/')) {
                  const m = src.match(/^data:([^;]+);base64,(.+)$/s);
                  if (!m) { falN++; continue; }
                  mime = m[1]; b64 = m[2];
                } else if (/^https?:\/\//.test(src)) {
                  const r2 = await fetch(src, { signal: AbortSignal.timeout(15000) });
                  if (!r2.ok) { falN++; continue; }
                  mime = String(r2.headers.get('content-type') || 'image/jpeg').split(';')[0];
                  if (!mime.startsWith('image/')) { falN++; continue; }
                  const buf = Buffer.from(await r2.arrayBuffer());
                  if (buf.length > 5 * 1024 * 1024) { falN++; continue; }
                  b64 = buf.toString('base64');
                } else { falN++; continue; }
                await query(`INSERT INTO biblioteca_midias (titulo, tipo, setor, categoria, mime, data)
                             VALUES ($1, 'foto', 'terapias', 'prova social', $2, $3)`,
                  [`Foto da conversa — ${convN.contact_name || 'Nágila'} — ${i + 1}`, mime, b64]);
                okN++;
              } catch { falN++; }
            }
            resNagila = `✅ ${okN} foto(s) da conversa de "${convN.contact_name}" salvas na Biblioteca (setor Terapias, prova social)${falN ? ` — ${falN} não deram (link expirado ou muito grandes)` : ''}.`;
          }
        }
      } catch (e) { resNagila = `⚠️ Erro: ${e.message}`; }
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['📚 Fotos da Nágila → Biblioteca',
         `${resNagila}\n\nElas já valem como prova social da Mary nas conversas de terapias. Lembrete: confirme a autorização de uso de imagem. Pra ver/remover: menu → Biblioteca → setor Terapias.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_fotos_nagila_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`📚 Fotos Nágila: ${resNagila}`);
    }

    // 📚 Correção do master: fotos da conversa da Nágila são prova social de VACINAS
    const { rows: [flagNagila2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_fotos_nagila_v2'");
    if (!flagNagila2) {
      const rN2 = await query(`UPDATE biblioteca_midias SET setor = 'vacinas'
                                WHERE categoria = 'prova social'
                                  AND lower(translate(titulo, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) LIKE '%nagila%'`).catch(() => ({ rowCount: 0 }));
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_fotos_nagila_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`📚 Fotos da Nágila remarcadas pra vacinas: ${rN2.rowCount || 0}`);
    }

    /* 🎯 META DE 100 MIL PRA CADA UMA (ordem do master, citando a Poliana):
       Poliana recebe explicitamente a meta de R$ 100.000 (igual Raylane e
       Suellen), e qualquer atendente/supervisora ativa que esteja com meta
       zerada/nula ganha os mesmos 100 mil. Metas personalizadas diferentes
       de zero NÃO são tocadas. */
    const { rows: [flagMeta100] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_meta_100k_poliana_v1'");
    if (!flagMeta100) {
      await query(`UPDATE usuarios SET meta_individual = 100000, updated_at = NOW()
                    WHERE ativo = true AND nome ILIKE 'poliana%'`).catch(() => {});
      const rM100 = await query(`UPDATE usuarios SET meta_individual = 100000, updated_at = NOW()
                                  WHERE ativo = true AND role IN ('atendente','supervisor')
                                    AND COALESCE(meta_individual, 0) = 0`).catch(() => ({ rowCount: 0 }));
      const { rows: metas } = await query(`SELECT nome, meta_individual FROM usuarios
        WHERE ativo = true AND role IN ('atendente','supervisor') ORDER BY nome`).catch(() => ({ rows: [] }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🎯 Metas conferidas — 100 mil pra cada',
         `Poliana ficou com meta de R$ 100.000 (e ${rM100.rowCount || 0} cadastro(s) que estavam sem meta também). Metas atuais: ${metas.map(m => `${m.nome.split(' ')[0]}: R$ ${Number(m.meta_individual || 0).toLocaleString('pt-BR')}`).join(' · ')}. O Caixa de cada uma mostra as próprias vendas — é registrar a venda (botão Venda na conversa ou pelo Caixa) que ela aparece.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_meta_100k_poliana_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🎯 Metas 100k conferidas (Poliana explícita)');
    }

    // 💡 Caminho da Meta da Raylane (frase do master) — merge preserva outras dicas
    const { rows: [flagDicaRay] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_dica_raylane_v1'");
    if (!flagDicaRay) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('dicas_meta', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor = COALESCE(configuracoes.valor,'{}'::jsonb) || $1::jsonb, updated_at = NOW()`,
        [JSON.stringify({ raylane: '💉 8 Planos Vacinais e você bate a SUA meta! E lembra: clientes de PACOTES MENSAIS podem se tornar clientes de Plano — olha sua carteira com carinho 💙' })]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_dica_raylane_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('💡 Dica da meta da Raylane gravada');
    }

    // 💡 v2 — ajuste do master: "pacotes MENSAIS" na dica da Raylane
    const { rows: [flagDicaRay2] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_dica_raylane_v2'");
    if (!flagDicaRay2) {
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('dicas_meta', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor = COALESCE(configuracoes.valor,'{}'::jsonb) || $1::jsonb, updated_at = NOW()`,
        [JSON.stringify({ raylane: '💉 8 Planos Vacinais e você bate a SUA meta! E lembra: clientes de PACOTES MENSAIS podem se tornar clientes de Plano — olha sua carteira com carinho 💙' })]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_dica_raylane_v2','{"ok":true}') ON CONFLICT DO NOTHING`);
    }

    /* 🤖 FOLLOW-UP DE IA LIGADO pras carteiras (ordem do master — equipe de
       vacinas: Stefany, Raylane e Poliana). Poliana ganha o botão da IA;
       cfg.followup vira true (a área followup já estava ligada). */
    const { rows: [flagFuVac] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_followup_vacinas_v1'");
    if (!flagFuVac) {
      await query(`UPDATE usuarios SET ia_consultas = true, updated_at = NOW()
                    WHERE ativo = true AND role <> 'master' AND nome ILIKE 'poliana%'`).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('bot', '{"followup":true}'::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor = COALESCE(configuracoes.valor,'{}'::jsonb) || '{"followup":true}'::jsonb, updated_at = NOW()`).catch(() => {});
      const { rows: comBotao } = await query(`SELECT nome FROM usuarios WHERE ativo = true AND ia_consultas = true ORDER BY nome`).catch(() => ({ rows: [] }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🤖 Follow-up de IA ligado pras carteiras',
         `A IA agora faz follow-up sozinha nas carteiras de quem tem o botão: ${comBotao.map(u => u.nome.split(' ')[0]).join(', ')}. Cliente que ficou sem responder recebe a retomada carinhosa ASSINADA PELO NOME da atendente responsável (até 3 tentativas, horário comercial, cada vez mais leve). Poliana ganhou o botão da IA. Quem desligar a chave pessoal na aba Assistente IA fica de fora — sem afetar as colegas.`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_followup_vacinas_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🤖 Follow-up de IA ligado; Poliana com o botão');
    }

    /* 🤖 IA NA CONVERSA DA SRA. NATHY (pedido do master, 22/08): ligar a Vitta
       nessa conversa pra ela conduzir o agendamento com prova social. O robô
       de uma passada acha a conversa pelo nome, liga o bot e garante setor de
       consultas (sem setor a IA completa não age); a vassoura da Mary pega a
       última mensagem pendente em até 5 min. Resultado no sino do master. */
    const { rows: [flagNathy] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_ia_nathy_v1'");
    if (!flagNathy) {
      const { rows: convsN } = await query(`
        SELECT id, contact_name, setor, phone FROM conversas
         WHERE contact_name ILIKE '%nathy%' AND contact_id NOT LIKE '%g.us%'
         ORDER BY last_message_at DESC NULLS LAST LIMIT 3`).catch(() => ({ rows: [] }));
      let textoN;
      if (convsN.length) {
        const cN = convsN[0];
        await query(`UPDATE conversas SET bot_ativo = true,
                       setor = CASE WHEN setor IN ('consultas','terapias') THEN setor ELSE 'consultas' END
                     WHERE id = $1`, [cN.id]).catch(() => {});
        textoN = `A Vitta foi ligada na conversa de ${cN.contact_name} (${cN.phone || 'sem telefone'})${convsN.length > 1 ? ` — havia ${convsN.length} conversas com "Nathy"; liguei na mais recente` : ''}. Setor garantido em consultas/terapias pra IA completa agir, com prova social (foto + Instagram) no momento certo. Se ela tiver mensagem sem resposta, a IA responde em até 5 minutos.`;
      } else {
        textoN = 'Não achei nenhuma conversa com "Nathy" no nome do contato. Confere como o nome está salvo no Chat e me diz — posso ligar a IA pelo nome exato ou pelo telefone.';
      }
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🤖 IA na conversa da Sra. Nathy', textoN]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_ia_nathy_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🤖 Seed IA Nathy:', convsN.length ? 'ligada' : 'conversa não encontrada');
    }

    /* 🎁 PRÊMIO DE META = R$ 2.500 (ordem do master, 22/08: "muda o prêmio
       para R$2.500"): o prêmio de quem bate a meta mínima sobe de R$ 1.500
       pra R$ 2.500 em todos os setores. Grava por cima do que estiver na
       config — a partir daqui o master ajusta pela tela de Metas. */
    const { rows: [flagPremio25] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_premio_2500_v1'");
    if (!flagPremio25) {
      await query(`INSERT INTO configuracoes (chave, valor)
                   VALUES ('metas', '{"premiosMin":{"vacinas":2500,"consultas":2500,"terapias":2500}}'::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET
                     valor = COALESCE(configuracoes.valor,'{}'::jsonb)
                       || jsonb_build_object('premiosMin',
                            COALESCE(configuracoes.valor->'premiosMin','{}'::jsonb)
                              || '{"vacinas":2500,"consultas":2500,"terapias":2500}'::jsonb),
                     updated_at = NOW()`).catch(() => {});
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🎁 Prêmio de meta agora é R$ 2.500',
         'O prêmio de quem bate a meta mínima subiu de R$ 1.500 para R$ 2.500 nos três setores — já aparece no placar de cada uma ("Seu prêmio do mês"). Pra ajustar de novo, é na tela de Metas.']).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_premio_2500_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log('🎁 Prêmio de meta: R$ 2.500 nos três setores');
    }

    /* 📎 ANEXO NA MENSAGEM PROGRAMADA (pedido do master, 22/08): a agendada
       pode levar um documento ou imagem junto — sai na hora marcada, antes
       do texto. Guardado como data URI; nome pro cliente ver o arquivo. */
    await query(`ALTER TABLE mensagens_agendadas ADD COLUMN IF NOT EXISTS anexo TEXT`).catch(() => {});
    await query(`ALTER TABLE mensagens_agendadas ADD COLUMN IF NOT EXISTS anexo_nome TEXT`).catch(() => {});

    /* 🆔 CÓDIGO DO CLIENTE (pedido do master, 22/08): cada cliente ganha um
       código único tipo VT-0123 — como um CPF curto da casa — porque cliente
       com nome repetido confunde a busca. SERIAL preenche as conversas
       existentes sozinho e numera as novas automaticamente. */
    await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS codigo SERIAL`).catch(() => {});
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversas_codigo ON conversas (codigo)`).catch(() => {});
    const { rows: [flagCod] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_codigo_cliente_v1'");
    if (!flagCod) {
      const { rows: [{ n: totalCod }] } = await query(`SELECT COUNT(*)::int n FROM conversas WHERE codigo IS NOT NULL`).catch(() => ({ rows: [{ n: 0 }] }));
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🆔 Cada cliente agora tem um código',
         `${totalCod} clientes receberam código único (VT-0001, VT-0002…) — o "CPF da casa" que o senhor pediu pra diferenciar clientes com o mesmo nome. O código aparece no topo da conversa e no painel Info (toque nele pra copiar), e a busca acha o cliente digitando o código (ex.: "VT-123" ou só "123").`]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_codigo_cliente_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🆔 Código do cliente: ${totalCod} conversas numeradas`);
    }

    /* 🔎 QUEM PERGUNTOU POR NOTA FISCAL? (pergunta do master, 22/08): robô de
       uma passada que varre as mensagens das últimas 48h procurando "nota
       fiscal" e entrega a resposta no sino do master, com nome, hora e trecho.
       Pra próxima vez, a lupa (Ctrl+K) do master já busca dentro das mensagens. */
    const { rows: [flagNF] } = await query("SELECT 1 FROM configuracoes WHERE chave = 'seed_busca_nota_fiscal_v1'");
    if (!flagNF) {
      const { rows: achadosNF } = await query(`
        SELECT c.contact_name, c.phone, m.content, m.created_at, m.from_type
          FROM mensagens m JOIN conversas c ON c.id = m.conversa_id
         WHERE m.type = 'text' AND m.created_at > NOW() - interval '48 hours'
           AND unaccent(lower(m.content)) LIKE '%nota%fiscal%'
           AND c.contact_id NOT LIKE '%g.us%'
         ORDER BY m.created_at DESC LIMIT 12`).catch(() => ({ rows: [] }));
      const soClientes = achadosNF.filter(a => a.from_type === 'contact');
      const lista = (soClientes.length ? soClientes : achadosNF).slice(0, 8).map(a => {
        const h = new Date(new Date(a.created_at).getTime() - 3 * 3600 * 1000);
        const hh = `${String(h.getUTCDate()).padStart(2, '0')}/${String(h.getUTCMonth() + 1).padStart(2, '0')} ${String(h.getUTCHours()).padStart(2, '0')}:${String(h.getUTCMinutes()).padStart(2, '0')}`;
        const quem = a.from_type === 'contact' ? '' : a.from_type === 'bot' ? ' (dito pela IA)' : ' (dito pela equipe)';
        return `• ${a.contact_name || a.phone || 'Cliente'} — ${hh}${quem}: "${String(a.content).slice(0, 110)}"`;
      }).join('\n');
      const textoNF = achadosNF.length
        ? `Falaram de nota fiscal nas últimas 48h:\n\n${lista}\n\nE agora a sua lupa (Ctrl+K) busca DENTRO das mensagens: digite qualquer termo (ex.: "nota fiscal") e veja quem falou, quando, e abra a conversa na hora.`
        : 'Não achei nenhuma mensagem com "nota fiscal" nas últimas 48h. Mas agora a sua lupa (Ctrl+K) busca dentro das mensagens: digite o termo e veja quem falou e quando.';
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('info', $1, $2, true)`,
        ['🔎 Quem perguntou por nota fiscal', textoNF]).catch(() => {});
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('seed_busca_nota_fiscal_v1','{"ok":true}') ON CONFLICT DO NOTHING`);
      console.log(`🔎 Busca nota fiscal: ${achadosNF.length} mensagem(ns) encontradas`);
    }

    console.log('✅ Auto-migrate complete');
  } catch (err) {
    console.error('⚠️  Auto-migrate error (non-fatal):', err.message);
  }
}
