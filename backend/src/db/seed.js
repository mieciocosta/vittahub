import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query } from './pool.js';

async function seed() {
  console.log('🌱 Seeding VittaHub database...');
  const HASH = await bcrypt.hash('vittalis123', 10);

  // Users
  await query(`
    INSERT INTO usuarios (id, nome, email, senha, role, cor) VALUES
      ('u1', 'Miecio Costa',      'miecio@vittalissaude.com.br',    $1, 'master',    '#00B8C0'),
      ('u2', 'Nágila Santos',     'nagila@vittalissaude.com.br',     $1, 'atendente', '#C4973B'),
      ('u3', 'Raquel Ferreira',   'raquel@vittalissaude.com.br',     $1, 'atendente', '#8b5cf6'),
      ('u4', 'Thales Oliveira',   'thales@vittalissaude.com.br',     $1, 'atendente', '#f97316')
    ON CONFLICT (id) DO NOTHING
  `, [HASH]);

  // Quick replies
  await query(`
    INSERT INTO respostas_rapidas (titulo, texto) VALUES
      ('Boas-vindas',        'Olá! 👋 Seja bem-vindo(a) à *Vittalis Saúde* 💎 _Sua vida é preciosa!_ Como posso te ajudar hoje?'),
      ('Horário',            'Atendemos de *segunda a sábado*, das 8h às 18h. Domingos e feriados das 8h às 12h 📅'),
      ('Localização',        'Estamos em São Luís - MA, Jardim Renascença 📍 Posso enviar o link do mapa agora!'),
      ('Solicitar valores',  'Para te enviar o orçamento personalizado, me informe qual vacina ou serviço você precisa 💉'),
      ('Plano Vacinal',      'Temos *planos vacinais completos* para adultos, crianças e gestantes. Posso te enviar os detalhes? 📋'),
      ('Agendamento',        'Ótimo! Vamos agendar 📅 Qual o melhor horário? (manhã ou tarde?)'),
      ('Confirmação',        'Perfeito! ✅ Agendamento confirmado. Até lá!'),
      ('Fechar',             'Muito obrigado(a) pelo contato! 🙏 Qualquer dúvida, pode chamar. Cuide-se!'),
      ('Oferecer proposta',  'Posso te enviar uma proposta personalizada com os valores e vacinas incluídas. Interesse? 📄')
    ON CONFLICT DO NOTHING
  `);

  // Bot config
  await query(`
    INSERT INTO configuracoes (chave, valor) VALUES
      ('bot', '{"ativo":true,"mensagemBoasVindas":"Olá! 💎 Sou a assistente da *Vittalis Saúde*!\\n\\n_Sua vida é preciosa!_\\n\\n1️⃣ Vacinas avulsas\\n2️⃣ Plano Vacinal\\n3️⃣ Consultas\\n4️⃣ Falar com atendente","respostas":{"1":"Temos vacinas avulsas 💉 Um atendente enviará os valores!","2":"Planos vacinais completos 👶🧑 Um atendente irá te ajudar!","3":"Consultas especializadas 🩺 Aguarde nosso atendente!","4":"Já chamo um atendente! 😊","default":"Entendido! Vou chamar um atendente 😊"},"transferirApos":1}')
    ON CONFLICT (chave) DO NOTHING
  `);

  // Sample leads
  const today = new Date().toISOString().split('T')[0];
  await query(`
    INSERT INTO leads (nome, telefone, email, origem, interesse, status, responsavel_id, valor_proposta, servico, observacoes, tags)
    VALUES
      ('Ana Beatriz Sousa',    '98991234567', 'ana@email.com',  'Instagram',   'Plano Vacinal', 'Fechado',            'u2', 580,  'Plano Vacinal Adulto',   'Veio pelo reels de HPV.',     '{"quente","plano"}'),
      ('Carlos Eduardo Lima',  '98987654321', 'carlos@email.com','Google',     'Vacina',        'Orçamento enviado',  'u1', 290,  'Febre Amarela + Hepatite','Viagem Belém em 15 dias.',   '{"urgente"}'),
      ('Fernanda Martins',     '98912349876', '',               'Indicação',   'Consulta',      'Em atendimento',     'u2', 150,  'Consulta Médica',         'Indicação da Ana Beatriz.',   '{}'),
      ('Juliana Ferreira',     '98977665544', 'ju@email.com',   'Instagram',   'Plano Vacinal', 'Aguardando retorno', 'u2', 420,  'Plano Vacinal Infantil',  'Mãe de criança 2 anos.',     '{"infantil"}'),
      ('Paulo Henrique Nunes', '98933221100', '',               'Google',      'Vacina',        'Novo lead',          'u3', 0,    '',                        'Perguntou sobre Varicela.',   '{}'),
      ('Mariana Oliveira',     '98955443322', 'mari@email.com', 'Indicação',   'Plano Vacinal', 'Fechado',            'u2', 760,  'Plano Vacinal Completo',  'Pagou à vista. VIP.',        '{"vip","plano"}'),
      ('Eduardo Costa Lima',   '98955667788', 'edu@email.com',  'Tráfego Pago','Vacina',        'Orçamento enviado',  'u4', 240,  'HPV + Varicela',          'Filha de 11 anos.',          '{"urgente"}'),
      ('Patrícia Figueiredo',  '98988776655', 'pat@email.com',  'Instagram',   'Plano Vacinal', 'Novo lead',          'u2', 0,    '',                        'Curtiu 3 posts no IG.',      '{"quente"}')
    ON CONFLICT DO NOTHING
  `);

  console.log('✅ Seed complete. Users: vittalis123 password');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
