import { v4 as uuidv4 } from 'uuid';

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];

export let leads = [
  {
    id: uuidv4(),
    nome: "Ana Beatriz Sousa",
    telefone: "98991234567",
    origem: "Instagram",
    interesse: "Plano Vacinal",
    status: "Fechado",
    responsavel: "Nágila Santos",
    valorProposta: 580.00,
    servico: "Plano Vacinal Adulto",
    dataEntrada: twoDaysAgo,
    dataRetorno: null,
    observacoes: "Cliente veio pelo reels de vacina HPV. Muito interessada.",
    motivoPerda: null
  },
  {
    id: uuidv4(),
    nome: "Carlos Eduardo Lima",
    telefone: "98987654321",
    origem: "Google",
    interesse: "Vacina",
    status: "Orçamento enviado",
    responsavel: "Miecio Costa",
    valorProposta: 290.00,
    servico: "Vacina Febre Amarela + Hepatite B",
    dataEntrada: yesterday,
    dataRetorno: today,
    observacoes: "Vai viajar para Belém em 15 dias. Urgente.",
    motivoPerda: null
  },
  {
    id: uuidv4(),
    nome: "Fernanda Martins",
    telefone: "98912349876",
    origem: "Indicação",
    interesse: "Consulta",
    status: "Em atendimento",
    responsavel: "Nágila Santos",
    valorProposta: 150.00,
    servico: "Consulta Médica",
    dataEntrada: yesterday,
    dataRetorno: null,
    observacoes: "Indicação da Ana Beatriz. Quer consulta antes de plano vacinal.",
    motivoPerda: null
  },
  {
    id: uuidv4(),
    nome: "Ricardo Alves",
    telefone: "98998887766",
    origem: "WhatsApp",
    interesse: "Terapia",
    status: "Perdido",
    responsavel: "Miecio Costa",
    valorProposta: 0,
    servico: "Terapia",
    dataEntrada: twoDaysAgo,
    dataRetorno: null,
    observacoes: "Não respondeu mais após orçamento.",
    motivoPerda: "Preço"
  },
  {
    id: uuidv4(),
    nome: "Juliana Ferreira Costa",
    telefone: "98977665544",
    origem: "Instagram",
    interesse: "Plano Vacinal",
    status: "Aguardando retorno",
    responsavel: "Nágila Santos",
    valorProposta: 420.00,
    servico: "Plano Vacinal Infantil",
    dataEntrada: today,
    dataRetorno: today,
    observacoes: "Mãe de criança de 2 anos. Pediu 2 dias para decidir.",
    motivoPerda: null
  },
  {
    id: uuidv4(),
    nome: "Paulo Henrique Nunes",
    telefone: "98933221100",
    origem: "Google",
    interesse: "Vacina",
    status: "Novo lead",
    responsavel: "Miecio Costa",
    valorProposta: 0,
    servico: "",
    dataEntrada: today,
    dataRetorno: null,
    observacoes: "Perguntou sobre vacina Varicela pelo WhatsApp.",
    motivoPerda: null
  },
  {
    id: uuidv4(),
    nome: "Mariana Oliveira",
    telefone: "98955443322",
    origem: "Indicação",
    interesse: "Plano Vacinal",
    status: "Fechado",
    responsavel: "Nágila Santos",
    valorProposta: 760.00,
    servico: "Plano Vacinal Adulto Completo",
    dataEntrada: twoDaysAgo,
    dataRetorno: null,
    observacoes: "Pagou à vista. Excelente cliente.",
    motivoPerda: null
  },
  {
    id: uuidv4(),
    nome: "Thiago Souza",
    telefone: "98944332211",
    origem: "WhatsApp",
    interesse: "Vacina",
    status: "Novo lead",
    responsavel: "",
    valorProposta: 0,
    servico: "",
    dataEntrada: today,
    dataRetorno: null,
    observacoes: "",
    motivoPerda: null
  }
];

// Simulated conversation store (in-memory)
export let conversations = {};
export let inboxMessages = [];

// Seed mock inbox messages
function seedInbox() {
  const now = Date.now();
  inboxMessages = [
    {
      id: uuidv4(),
      channel: 'whatsapp',
      contactName: 'Ana Beatriz Sousa',
      contactId: '5598991234567@s.whatsapp.net',
      phone: '98991234567',
      lastMessage: 'Boa tarde! Queria saber mais sobre o plano vacinal adulto 😊',
      lastMessageTime: new Date(now - 5 * 60000).toISOString(),
      unread: 2,
      avatar: null,
      status: 'active',
      messages: [
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Boa tarde! Vi o post de vocês no Instagram', timestamp: new Date(now - 20 * 60000).toISOString() },
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Queria saber mais sobre o plano vacinal adulto 😊', timestamp: new Date(now - 5 * 60000).toISOString() },
      ]
    },
    {
      id: uuidv4(),
      channel: 'whatsapp',
      contactName: 'Carlos Eduardo Lima',
      contactId: '5598987654321@s.whatsapp.net',
      phone: '98987654321',
      lastMessage: 'Quanto custa a vacina febre amarela?',
      lastMessageTime: new Date(now - 30 * 60000).toISOString(),
      unread: 1,
      avatar: null,
      status: 'active',
      messages: [
        { id: uuidv4(), from: 'me', type: 'text', content: 'Olá Carlos! Como posso ajudar?', timestamp: new Date(now - 45 * 60000).toISOString() },
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Quanto custa a vacina febre amarela?', timestamp: new Date(now - 30 * 60000).toISOString() },
      ]
    },
    {
      id: uuidv4(),
      channel: 'instagram',
      contactName: 'julinha.fc',
      contactId: 'ig_123456789',
      phone: null,
      lastMessage: 'Vocês atendem crianças de 2 anos?',
      lastMessageTime: new Date(now - 2 * 3600000).toISOString(),
      unread: 3,
      avatar: null,
      status: 'active',
      messages: [
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Oi! Vi o perfil de vocês', timestamp: new Date(now - 3 * 3600000).toISOString() },
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Vocês atendem crianças de 2 anos?', timestamp: new Date(now - 2 * 3600000).toISOString() },
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Queria marcar vacinação infantil', timestamp: new Date(now - 2 * 3600000 + 30000).toISOString() },
      ]
    },
    {
      id: uuidv4(),
      channel: 'whatsapp',
      contactName: 'Thiago Souza',
      contactId: '5598944332211@s.whatsapp.net',
      phone: '98944332211',
      lastMessage: 'Tem vacina de varicela disponível?',
      lastMessageTime: new Date(now - 4 * 3600000).toISOString(),
      unread: 0,
      avatar: null,
      status: 'active',
      messages: [
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Tem vacina de varicela disponível?', timestamp: new Date(now - 4 * 3600000).toISOString() },
        { id: uuidv4(), from: 'me', type: 'text', content: 'Olá Thiago! Sim, temos varicela disponível. Posso enviar os valores?', timestamp: new Date(now - 3.5 * 3600000).toISOString() },
      ]
    },
    {
      id: uuidv4(),
      channel: 'instagram',
      contactName: 'marcos.saude',
      contactId: 'ig_987654321',
      phone: null,
      lastMessage: 'Qual o horário de funcionamento?',
      lastMessageTime: new Date(now - 24 * 3600000).toISOString(),
      unread: 0,
      avatar: null,
      status: 'active',
      messages: [
        { id: uuidv4(), from: 'contact', type: 'text', content: 'Qual o horário de funcionamento?', timestamp: new Date(now - 24 * 3600000).toISOString() },
        { id: uuidv4(), from: 'me', type: 'text', content: 'Funcionamos de segunda a sábado, das 8h às 18h! 😊', timestamp: new Date(now - 23 * 3600000).toISOString() },
      ]
    }
  ];
}

seedInbox();

export const responsaveis = ["Nágila Santos", "Miecio Costa", "Atendente 3"];
export const origens = ["Instagram", "Google", "Indicação", "WhatsApp"];
export const interesses = ["Consulta", "Vacina", "Plano Vacinal", "Terapia"];
export const statusList = ["Novo lead", "Em atendimento", "Orçamento enviado", "Aguardando retorno", "Fechado", "Perdido"];
