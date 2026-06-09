import { v4 as uuid } from 'uuid';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const d = (daysAgo, h=9, m=0) => { const dt = new Date(); dt.setDate(dt.getDate()-daysAgo); dt.setHours(h,m,0,0); return dt.toISOString(); };
const today = () => new Date().toISOString().split('T')[0];
const isoDate = (daysAgo) => { const dt = new Date(); dt.setDate(dt.getDate()-daysAgo); return dt.toISOString().split('T')[0]; };

// ─── USERS ────────────────────────────────────────────────────────────────────
// All passwords = "vittalis123"
// All passwords = "vittalis123"
const HASH = '$2a$10$cN37T5X1avg5O9aY5PO84uSb4XBatGQ3V6QNQTQ673N03sEKd20FK';
export const users = [
  { id:'u1', nome:'Miecio Costa',      email:'miecio@vittalissaude.com.br',    senha:HASH, role:'master',    ativo:true,  avatar:null, cor:'#00B8C0' },
  { id:'u2', nome:'Nágila Santos',     email:'nagila@vittalissaude.com.br',     senha:HASH, role:'atendente', ativo:true,  avatar:null, cor:'#C4973B' },
  { id:'u3', nome:'Raquel Ferreira',   email:'raquel@vittalissaude.com.br',     senha:HASH, role:'atendente', ativo:true,  avatar:null, cor:'#8b5cf6' },
  { id:'u4', nome:'Thales Oliveira',   email:'thales@vittalissaude.com.br',     senha:HASH, role:'atendente', ativo:true,  avatar:null, cor:'#f97316' },
  { id:'u5', nome:'Bot Vittalis',      email:'bot@vittalissaude.com.br',        senha:HASH, role:'bot',       ativo:true,  avatar:null, cor:'#10b981' },
];

// ─── AUTO-ASSIGN QUEUE ────────────────────────────────────────────────────────
// Round-robin queue for atendentes
export const assignQueue = { index: 0, atendentes: ['u2','u3','u4'] };

export function nextAtendente() {
  const id = assignQueue.atendentes[assignQueue.index % assignQueue.atendentes.length];
  assignQueue.index++;
  return id;
}

// ─── LEADS ────────────────────────────────────────────────────────────────────
export let leads = [
  { id:'l01', nome:'Ana Beatriz Sousa',       telefone:'98991234567', email:'ana@email.com',     origem:'Instagram',    interesse:'Plano Vacinal', status:'Fechado',            responsavelId:'u2', valorProposta:580,  servico:'Plano Vacinal Adulto',          dataEntrada:isoDate(8), dataRetorno:null,         observacoes:'Veio pelo reels de HPV. Fechou na 1ª conversa.', motivoPerda:null, tags:['quente','plano'], vittasysClienteId:null },
  { id:'l02', nome:'Carlos Eduardo Lima',     telefone:'98987654321', email:'carlos@email.com',  origem:'Google',       interesse:'Vacina',        status:'Orçamento enviado',  responsavelId:'u1', valorProposta:290,  servico:'Febre Amarela + Hepatite B',    dataEntrada:isoDate(3), dataRetorno:today(),      observacoes:'Viagem Belém em 15 dias. URGENTE.', motivoPerda:null, tags:['urgente'], vittasysClienteId:null },
  { id:'l03', nome:'Fernanda Martins',        telefone:'98912349876', email:'',                  origem:'Indicação',    interesse:'Consulta',      status:'Em atendimento',     responsavelId:'u2', valorProposta:150,  servico:'Consulta Médica',               dataEntrada:isoDate(2), dataRetorno:null,         observacoes:'Indicação da Ana Beatriz.', motivoPerda:null, tags:[], vittasysClienteId:null },
  { id:'l04', nome:'Ricardo Alves',           telefone:'98998887766', email:'',                  origem:'WhatsApp',     interesse:'Terapia',       status:'Perdido',            responsavelId:'u1', valorProposta:0,    servico:'Terapia',                       dataEntrada:isoDate(6), dataRetorno:null,         observacoes:'Sumiu após orçamento.', motivoPerda:'Preço', tags:[], vittasysClienteId:null },
  { id:'l05', nome:'Juliana Ferreira Costa',  telefone:'98977665544', email:'ju@email.com',      origem:'Instagram',    interesse:'Plano Vacinal', status:'Aguardando retorno', responsavelId:'u2', valorProposta:420,  servico:'Plano Vacinal Infantil',        dataEntrada:today(),    dataRetorno:today(),      observacoes:'Mãe de criança 2 anos. Pediu 2 dias.', motivoPerda:null, tags:['infantil'], vittasysClienteId:null },
  { id:'l06', nome:'Paulo Henrique Nunes',    telefone:'98933221100', email:'',                  origem:'Google',       interesse:'Vacina',        status:'Novo lead',          responsavelId:'u3', valorProposta:0,    servico:'',                              dataEntrada:today(),    dataRetorno:null,         observacoes:'Perguntou sobre Varicela.', motivoPerda:null, tags:[], vittasysClienteId:null },
  { id:'l07', nome:'Mariana Oliveira',        telefone:'98955443322', email:'mari@email.com',    origem:'Indicação',    interesse:'Plano Vacinal', status:'Fechado',            responsavelId:'u2', valorProposta:760,  servico:'Plano Vacinal Adulto Completo', dataEntrada:isoDate(5), dataRetorno:null,         observacoes:'Pagou à vista. Cliente VIP.', motivoPerda:null, tags:['vip','plano'], vittasysClienteId:null },
  { id:'l08', nome:'Thiago Souza',            telefone:'98944332211', email:'',                  origem:'WhatsApp',     interesse:'Vacina',        status:'Novo lead',          responsavelId:'u4', valorProposta:0,    servico:'',                              dataEntrada:today(),    dataRetorno:null,         observacoes:'', motivoPerda:null, tags:[], vittasysClienteId:null },
  { id:'l09', nome:'Beatriz Lemos',           telefone:'98922113344', email:'bia@email.com',     origem:'Instagram',    interesse:'Plano Vacinal', status:'Em atendimento',     responsavelId:'u2', valorProposta:520,  servico:'Plano Vacinal Adulto',          dataEntrada:isoDate(4), dataRetorno:null,         observacoes:'Muito interessada. Aguarda marido decidir.', motivoPerda:null, tags:['casal'], vittasysClienteId:null },
  { id:'l10', nome:'Rodrigo Fonseca',         telefone:'98911223344', email:'rod@email.com',     origem:'Google',       interesse:'Vacina',        status:'Fechado',            responsavelId:'u1', valorProposta:180,  servico:'Vacina Gripe + Pneumonia',      dataEntrada:isoDate(7), dataRetorno:null,         observacoes:'', motivoPerda:null, tags:[], vittasysClienteId:null },
  { id:'l11', nome:'Carla Mendes Santos',     telefone:'98966554433', email:'',                  origem:'Facebook',     interesse:'Plano Vacinal', status:'Em atendimento',     responsavelId:'u3', valorProposta:380,  servico:'Plano Vacinal Adolescente',     dataEntrada:isoDate(1), dataRetorno:null,         observacoes:'Filha de 13 anos.', motivoPerda:null, tags:['infantil'], vittasysClienteId:null },
  { id:'l12', nome:'Eduardo Costa Lima',      telefone:'98955667788', email:'edu@email.com',     origem:'Tráfego Pago', interesse:'Vacina',        status:'Orçamento enviado',  responsavelId:'u4', valorProposta:240,  servico:'HPV + Varicela',                dataEntrada:isoDate(2), dataRetorno:isoDate(-1),  observacoes:'Aniversário da filha semana que vem.', motivoPerda:null, tags:['urgente'], vittasysClienteId:null },
  { id:'l13', nome:'Patrícia Figueiredo',     telefone:'98988776655', email:'pat@email.com',     origem:'Instagram',    interesse:'Plano Vacinal', status:'Novo lead',          responsavelId:'u2', valorProposta:0,    servico:'',                              dataEntrada:today(),    dataRetorno:null,         observacoes:'Curtiu 3 posts seguidos antes de mandar mensagem.', motivoPerda:null, tags:['quente'], vittasysClienteId:null },
  { id:'l14', nome:'Samuel Barbosa',          telefone:'98911335577', email:'',                  origem:'Indicação',    interesse:'Consulta',      status:'Perdido',            responsavelId:'u3', valorProposta:0,    servico:'',                              dataEntrada:isoDate(10),dataRetorno:null,         observacoes:'', motivoPerda:'Sem retorno', tags:[], vittasysClienteId:null },
  { id:'l15', nome:'Camila Rodrigues',        telefone:'98999001122', email:'cami@email.com',    origem:'Google',       interesse:'Plano Vacinal', status:'Fechado',            responsavelId:'u3', valorProposta:640,  servico:'Plano Vacinal Adulto Premium',  dataEntrada:isoDate(9), dataRetorno:null,         observacoes:'Fechou no mesmo dia. Excelente.', motivoPerda:null, tags:['vip'], vittasysClienteId:null },
];

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────
export let conversations = [
  {
    id:'cv1', channel:'whatsapp', contactName:'Ana Beatriz Sousa', contactId:'5598991234567@s.whatsapp.net', phone:'98991234567',
    lastMessage:'Perfeito! Obrigada 💎', lastMessageTime:d(0,14,30), unread:0, responsavelId:'u2', leadId:'l01', tags:['quente'],
    botAtivo:false,
    messages:[
      {id:uuid(),from:'contact',type:'text',content:'Boa tarde! Vi o post de vocês sobre vacinas',timestamp:d(0,13,20)},
      {id:uuid(),from:'bot',type:'text',content:'Olá! 💎 Sou a assistente virtual da Vittalis Saúde! *Sua vida é preciosa!*\n\nComo posso te ajudar?\n\n1️⃣ Vacinas avulsas\n2️⃣ Plano Vacinal\n3️⃣ Consultas\n4️⃣ Falar com atendente',timestamp:d(0,13,21)},
      {id:uuid(),from:'contact',type:'text',content:'2',timestamp:d(0,13,25)},
      {id:uuid(),from:'bot',type:'text',content:'Ótimo! Temos planos vacinais completos para adultos e crianças 💉\n\nUm(a) atendente irá te ajudar em instantes!',timestamp:d(0,13,26)},
      {id:uuid(),from:'me',type:'text',content:'Olá Ana! Sou a Nágila da Vittalis 😊 Vou te explicar tudo sobre nosso plano!',timestamp:d(0,13,35),senderId:'u2',senderNome:'Nágila Santos'},
      {id:uuid(),from:'contact',type:'text',content:'Perfeito! Obrigada 💎',timestamp:d(0,14,30)},
    ]
  },
  {
    id:'cv2', channel:'whatsapp', contactName:'Carlos Eduardo Lima', contactId:'5598987654321@s.whatsapp.net', phone:'98987654321',
    lastMessage:'Quanto custa a vacina febre amarela? Vou viajar',lastMessageTime:d(0,10,15), unread:1, responsavelId:'u1', leadId:'l02', tags:['urgente'],
    botAtivo:false,
    messages:[
      {id:uuid(),from:'contact',type:'text',content:'Quanto custa a vacina febre amarela? Vou viajar para Belém em 2 semanas',timestamp:d(0,10,15)},
    ]
  },
  {
    id:'cv3', channel:'instagram', contactName:'julinha.fc', contactId:'ig_123456789', phone:null,
    lastMessage:'Queria marcar vacinação infantil 👶',lastMessageTime:d(0,9,0), unread:3, responsavelId:null, leadId:null, tags:[],
    botAtivo:true,
    messages:[
      {id:uuid(),from:'contact',type:'text',content:'Oi! Vi o perfil de vocês no Instagram',timestamp:d(0,8,50)},
      {id:uuid(),from:'contact',type:'text',content:'Vocês atendem crianças de 2 anos?',timestamp:d(0,9,0)},
      {id:uuid(),from:'contact',type:'text',content:'Queria marcar vacinação infantil 👶',timestamp:d(0,9,1)},
    ]
  },
  {
    id:'cv4', channel:'whatsapp', contactName:'Patrícia Figueiredo', contactId:'5598988776655@s.whatsapp.net', phone:'98988776655',
    lastMessage:'Oi! Quero saber sobre planos vacinais', lastMessageTime:d(0,11,0), unread:2, responsavelId:'u2', leadId:'l13', tags:['quente'],
    botAtivo:false,
    messages:[
      {id:uuid(),from:'contact',type:'text',content:'Oi! Quero saber sobre planos vacinais',timestamp:d(0,11,0)},
      {id:uuid(),from:'contact',type:'text',content:'Qual o valor?',timestamp:d(0,11,2)},
    ]
  },
  {
    id:'cv5', channel:'whatsapp', contactName:'Eduardo Costa Lima', contactId:'5598955667788@s.whatsapp.net', phone:'98955667788',
    lastMessage:'Pode me enviar o orçamento?', lastMessageTime:d(1,15,0), unread:0, responsavelId:'u4', leadId:'l12', tags:['urgente'],
    botAtivo:false,
    messages:[
      {id:uuid(),from:'contact',type:'text',content:'Olá, preciso de vacinas para minha filha',timestamp:d(1,14,30)},
      {id:uuid(),from:'me',type:'text',content:'Olá Eduardo! Aqui é o Thales da Vittalis 😊 Quais vacinas você está precisando?',timestamp:d(1,14,45),senderId:'u4',senderNome:'Thales Oliveira'},
      {id:uuid(),from:'contact',type:'text',content:'HPV e Varicela. Ela tem 11 anos',timestamp:d(1,14,50)},
      {id:uuid(),from:'contact',type:'text',content:'Pode me enviar o orçamento?',timestamp:d(1,15,0)},
    ]
  },
  {
    id:'cv6', channel:'instagram', contactName:'marcos.saude_slz', contactId:'ig_987654321', phone:null,
    lastMessage:'Perfeito, vou agendar sim!', lastMessageTime:d(2,16,0), unread:0, responsavelId:'u3', leadId:null, tags:[],
    botAtivo:false,
    messages:[
      {id:uuid(),from:'contact',type:'text',content:'Qual o horário de funcionamento?',timestamp:d(2,15,30)},
      {id:uuid(),from:'me',type:'text',content:'Seg a sáb, 8h às 18h! Quer agendar? 😊',timestamp:d(2,15,45),senderId:'u3',senderNome:'Raquel Ferreira'},
      {id:uuid(),from:'contact',type:'text',content:'Perfeito, vou agendar sim!',timestamp:d(2,16,0)},
    ]
  },
  {
    id:'cv7', channel:'whatsapp', contactName:'Thiago Souza', contactId:'5598944332211@s.whatsapp.net', phone:'98944332211',
    lastMessage:'Tem vacina de varicela disponível?', lastMessageTime:d(0,8,0), unread:1, responsavelId:'u4', leadId:'l08', tags:[],
    botAtivo:false,
    messages:[
      {id:uuid(),from:'contact',type:'text',content:'Tem vacina de varicela disponível?',timestamp:d(0,8,0)},
    ]
  },
];

// ─── QUICK REPLIES ─────────────────────────────────────────────────────────────
export const quickReplies = [
  {id:'qr1',titulo:'Boas-vindas',        texto:'Olá! 👋 Seja bem-vindo(a) à *Vittalis Saúde* 💎 _Sua vida é preciosa!_ Como posso te ajudar hoje?'},
  {id:'qr2',titulo:'Horário',            texto:'Atendemos de *segunda a sábado*, das 8h às 18h. Domingos e feriados das 8h às 12h 📅'},
  {id:'qr3',titulo:'Localização',        texto:'Estamos em São Luís - MA 📍 Posso enviar o link do mapa agora!'},
  {id:'qr4',titulo:'Solicitar valores',  texto:'Para te enviar o orçamento personalizado, me informe qual vacina ou serviço você precisa 💉'},
  {id:'qr5',titulo:'Plano Vacinal',      texto:'Temos *planos vacinais completos* para adultos, crianças e gestantes. Posso te enviar os detalhes? 📋'},
  {id:'qr6',titulo:'Agendamento',        texto:'Ótimo! Vamos agendar 📅 Qual o melhor horário para você? (manhã ou tarde?)'},
  {id:'qr7',titulo:'Confirmação',        texto:'Perfeito! ✅ Agendamento confirmado para você. Até lá!'},
  {id:'qr8',titulo:'Fechar conversa',    texto:'Muito obrigado(a) pelo contato! 🙏 Qualquer dúvida, pode chamar. Cuide-se!'},
  {id:'qr9',titulo:'Oferecer proposta',  texto:'Posso te enviar uma proposta personalizada com os valores e vacinas incluídas. Interesse? 📄'},
];

// ─── BOT CONFIG ───────────────────────────────────────────────────────────────
export const botConfig = {
  ativo: true,
  mensagemBoasVindas: 'Olá! 💎 Sou a assistente virtual da *Vittalis Saúde*! _Sua vida é preciosa!_\n\nComo posso te ajudar?\n\n1️⃣ Vacinas avulsas\n2️⃣ Plano Vacinal\n3️⃣ Consultas\n4️⃣ Falar com atendente',
  respostas: {
    '1': 'Temos uma ampla variedade de vacinas avulsas 💉 Um(a) atendente vai te enviar os valores em instantes!',
    '2': 'Ótimo! Temos planos vacinais para adultos, crianças e gestantes 👶🧑 Um(a) atendente irá te ajudar!',
    '3': 'Oferecemos consultas médicas especializadas 🩺 Aguarde que um(a) atendente irá te chamar!',
    '4': 'Claro! Já chamo um(a) atendente para você 😊',
    'default': 'Entendido! Vou chamar um(a) atendente para te ajudar melhor 😊',
  },
  transferirApos: 1, // transfer after N messages
};

// ─── VITTASYS PROPOSTAS ───────────────────────────────────────────────────────
export const vittasysPlanos = [
  { id:'plano_adulto_basico',    nome:'Plano Vacinal Adulto Básico',    preco:420,  descricao:'HPV + Varicela + Hepatite A' },
  { id:'plano_adulto_completo',  nome:'Plano Vacinal Adulto Completo',  preco:760,  descricao:'Plano completo com 8 vacinas essenciais' },
  { id:'plano_infantil_0_6',     nome:'Plano Infantil 0-6 meses',      preco:1850, descricao:'Hexacelular, Rotavírus, Pneumocócica e mais' },
  { id:'plano_infantil_0_9',     nome:'Plano Infantil 0-9 meses',      preco:2400, descricao:'Cobertura completa até 9 meses' },
  { id:'plano_gestante',         nome:'Plano Gestante',                 preco:680,  descricao:'dTpa, Influenza, Hepatite B' },
  { id:'plano_idoso',            nome:'Plano Idoso (60+)',              preco:540,  descricao:'Pneumocócica, Influenza, Zóster' },
];

export const vittasysVacinas = [
  { id:'v1',  nome:'HPV 9-valente',       preco:950,  doses:3 },
  { id:'v2',  nome:'Febre Amarela',        preco:250,  doses:1 },
  { id:'v3',  nome:'Varicela',             preco:450,  doses:2 },
  { id:'v4',  nome:'Hepatite A',           preco:250,  doses:2 },
  { id:'v5',  nome:'Hepatite B',           preco:0,    doses:3 },
  { id:'v6',  nome:'Influenza',            preco:180,  doses:1 },
  { id:'v7',  nome:'Pneumocócica 20',      preco:800,  doses:1 },
  { id:'v8',  nome:'Meningocócica ACWY',   preco:500,  doses:1 },
  { id:'v9',  nome:'Herpes Zóster',        preco:1200, doses:2 },
  { id:'v10', nome:'Tríplice Viral',       preco:280,  doses:1 },
  { id:'v11', nome:'dTpa (adulto)',         preco:180,  doses:1 },
  { id:'v12', nome:'Hexacelular',          preco:450,  doses:3 },
];

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export let notifications = [
  {id:'n1', tipo:'retorno',     titulo:'Retorno hoje',     texto:'Carlos Eduardo Lima aguarda retorno', leadId:'l02', lida:false, createdAt:d(0,8,0)},
  {id:'n2', tipo:'novo_lead',   titulo:'Novo lead',        texto:'Patrícia Figueiredo entrou pelo Instagram', leadId:'l13', lida:false, createdAt:d(0,11,0)},
  {id:'n3', tipo:'mensagem',    titulo:'Nova mensagem WA', texto:'2 msgs de julinha.fc (Instagram)', convId:'cv3', lida:false, createdAt:d(0,9,1)},
  {id:'n4', tipo:'proposta',    titulo:'Proposta pendente',texto:'Eduardo Costa Lima aguarda orçamento', leadId:'l12', lida:true,  createdAt:d(1,14,0)},
];

// ─── META ─────────────────────────────────────────────────────────────────────
export const ORIGENS     = ['Instagram','Google','Indicação','WhatsApp','Facebook','Tráfego Pago','Organico','Outro'];
export const INTERESSES  = ['Consulta','Vacina','Plano Vacinal','Terapia','Plano Infantil','Gestante','Outro'];
export const STATUS_LIST = ['Novo lead','Em atendimento','Orçamento enviado','Aguardando retorno','Fechado','Perdido'];
export const MOTIVOS_PERDA = ['Preço','Concorrência','Sem interesse','Sem retorno','Adiou','Não tem plano de saúde','Outro'];
export const TAGS        = ['urgente','quente','plano','vip','infantil','retorno','casal','gestante','indicação','frio'];
