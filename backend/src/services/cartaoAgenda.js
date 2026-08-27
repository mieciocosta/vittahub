/* 🗓️ CARTÃO OFICIAL DE AGENDAMENTO — formato ditado pelo master (22/08).
   Fonte ÚNICA do cartão: a confirmação que a IA manda ao agendar, o lembrete
   de véspera e o lembrete automático de amanhã saem TODOS daqui, idênticos.
   Muda só o título e a frase inicial (ordem do master, 24/08). Assim o cliente
   vê sempre o mesmo cartão bonito, e a casa fala uma língua só. */
import { query } from '../db/pool.js';

const DIAS_SEM = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// Endereço da clínica + Google Maps — só entra quando o atendimento é aqui.
const ENDERECO = [
  '🏥 Nosso endereço, Clínica Vittalis Saúde:',
  'Ed. Business Center, Térreo',
  'Av. Cel. Colares Moreira, 3A, Renascença',
  'São Luís/MA',
  '🗺️ Como chegar: https://share.google/cJwx0T5DVaCxZyc6I',
];
const INSTAGRAM = '📸 Acompanhe momentos de cuidado no nosso Instagram: https://www.instagram.com/vittalissaudeslz/';

export const ehEmCasa = (txt) => /resid|casa|domic/i.test(String(txt || ''));
/* 🏥 O endereço da clínica só entra quando o atendimento é AQUI. A regra antiga
   era "se não for em casa, manda o endereço" — e aí um cartão com "Local: Parque
   Vitória" saía com o endereço da Renascença embaixo, mandando a família pro
   lugar errado (cobrança do master, 27/08). Agora a pergunta certa: o local diz
   que é na clínica? Só então o endereço e o Maps entram. */
export const ehNaClinica = (txt) => {
  const t = String(txt || '').trim();
  if (!t) return true;                       // sem local informado = na clínica
  if (ehEmCasa(t)) return false;
  return /cl[íi]nica|vittalis|renascen|consult[óo]rio|business center|colares moreira/i.test(t);
};

/* O título diz do que se trata: vacinação, consulta ou sessão de terapia
   (ordem do master, 24/08: "melhora o título para que fique conforme o
   conteúdo da mensagem"). Lê o serviço e, se faltar, o setor do evento. */
function assuntoDoCartao({ servico, setor, profissional } = {}) {
  const t = `${servico || ''} ${setor || ''}`.toLowerCase();
  if (/vacin|imuniz|dose/.test(t)) return { nome: 'vacinação', artigo: 'da sua', posse: 'Sua', fem: true };
  if (/terapia|fono|psico|ocupacional|psicomotric|nutri|\baba\b|sess/.test(t)) return { nome: 'sessão de terapia', artigo: 'da sua', posse: 'Sua', fem: true };
  if (/consulta|avalia|pediatr|retorno/.test(t) || profissional) return { nome: 'consulta', artigo: 'da sua', posse: 'Sua', fem: true };
  return { nome: 'atendimento', artigo: 'do seu', posse: 'Seu', fem: false };
}

/* dados: { cliente, paciente, data 'YYYY-MM-DD', hora, profissional, especialidade,
            local, servico, tratamento 'papai'|'mamãe' }
   opts:  { titulo, frase } — o resto do cartão nunca muda. */
export async function cartaoAgendamento(dados = {}, opts = {}) {
  const assunto = assuntoDoCartao({ servico: dados.servico, setor: dados.setor, profissional: dados.profissional });
  /* Título AFIRMATIVO (ordem do master, 24/08): a família não recebe um aviso
     burocrático, recebe a certeza de que está tudo reservado. Confirmação vira
     "Vacinação confirmada"; o lembrete vira "Sua vacinação é amanhã". */
  const titulo = opts.titulo || (opts.lembrete
    ? `🔔 ${assunto.posse} ${assunto.nome} é amanhã`
    : `✅ ${assunto.nome.charAt(0).toUpperCase() + assunto.nome.slice(1)} confirmad${assunto.fem ? 'a' : 'o'}`);
  const dataISO = String(dados.data || '').slice(0, 10);
  const dSem = /^\d{4}-\d{2}-\d{2}$/.test(dataISO) ? (DIAS_SEM[new Date(dataISO + 'T12:00:00Z').getUTCDay()] || '') : '';
  const dataBR = dataISO ? dataISO.split('-').reverse().join('/') : '';
  const hora = String(dados.hora || '').replace(/hs?$/i, '').trim();
  const localTxt = String(dados.local || '').trim() || 'Na Clínica Vittalis Saúde (Renascença)';
  const trat = ['papai', 'mamãe'].includes(String(dados.tratamento || '')) ? dados.tratamento : '';

  const linhas = [titulo];
  if (opts.frase) { linhas.push(''); linhas.push(String(opts.frase)); }
  linhas.push('');
  linhas.push(`📁 Cliente: ${String(dados.cliente || 'Cliente').slice(0, 60)}`);
  linhas.push(`👶🏻 Paciente: ${String(dados.paciente || '').slice(0, 60)}`);
  linhas.push(`📅 Data: ${dataBR}${dSem ? ` ${dSem}` : ''}`);
  linhas.push(`🕓 Horário: ${hora}hs`);

  if (dados.profissional) {
    // Especialidade junto do nome (pedido do master): Dra. Luísa (Pediatra)
    let espec = String(dados.especialidade || '').trim();
    if (!espec) {
      const { rows: [pf] } = await query(`SELECT especialidade FROM profissionais
        WHERE ativo = true AND nome ILIKE $1 LIMIT 1`, [String(dados.profissional).trim()]).catch(() => ({ rows: [] }));
      espec = String(pf?.especialidade || '').trim();
    }
    linhas.push(`👩‍⚕️ Profissional: ${String(dados.profissional).slice(0, 60)}${espec ? ` (${espec.slice(0, 40)})` : ''}`);
  }
  linhas.push(`📍 Local: ${localTxt.slice(0, 80)}`);
  linhas.push(`📌 Serviço: ${String(dados.servico || 'Atendimento').slice(0, 80)}`);

  if (ehNaClinica(localTxt)) { linhas.push(''); linhas.push(...ENDERECO); }
  linhas.push('');
  linhas.push(`Parabéns ${trat ? trat + ' ' : ''}pelo investimento na saúde do seu Baby 🩵`);
  linhas.push('');
  linhas.push(INSTAGRAM);
  return linhas.join('\n');
}

/* Um evento da agenda vira o mesmo cartão. O local sai do endereço cadastrado
   (visita em casa) ou do próprio serviço ("vacinação em domicílio"); sem nada
   disso, é atendimento na clínica. */
export async function cartaoDoEvento(ev = {}, opts = {}) {
  const emCasa = !!String(ev.endereco || '').trim() || ehEmCasa(ev.servico);
  return cartaoAgendamento({
    cliente: ev.responsavel_nome || ev.cliente || ev.paciente,
    paciente: ev.paciente,
    data: ev.data,
    hora: ev.hora,
    profissional: ev.profissional,
    setor: ev.setor,
    servico: ev.servico || (ev.setor === 'terapias' ? 'Sessão de terapia' : ev.setor === 'consultas' ? 'Consulta' : 'Vacinação'),
    /* Visita em casa mostra ONDE (bairro/endereço curto): a família confere que
       marcamos no lugar certo. Sem endereço cadastrado, fica só "residência". */
    local: emCasa
      ? (String(ev.endereco || '').trim()
          ? `Em sua residência — ${String(ev.endereco).trim().slice(0, 48)}`
          : 'Em sua residência')
      : 'Na Clínica Vittalis Saúde (Renascença)',
  }, opts);
}
