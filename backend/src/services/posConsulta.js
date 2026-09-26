/* ═══════════════════════════════════════════════════════════════════════════
   🩺 PÓS CONSULTA — regras puras (sem banco, sem rede)

   Pedido do master (26/09): "cria na agenda do dia seguinte o Pós Consulta de
   todos os pacientes que fizeram consulta e terapia no dia, igual tem no
   VittaHub (o Pós Vacinal), de forma que não conflita com agendamentos —
   pode ficar em uma parte separada".

   Aqui mora o que decide: o que conta como "fez" (não cancelou, não faltou,
   não remarcou e o horário já passou), em que dia cai o pós (o seguinte; se
   já passou, hoje; domingo vira segunda), um pós só por paciente por dia
   (consulta + terapia no mesmo dia = um contato) e o horário da lista
   (9:00, 10:00… como o Pós Vacinal). O robô e as rotas ficam em
   routes/posConsulta.js.
   ═══════════════════════════════════════════════════════════════════════════ */

// Dia e hora em São Luís (UTC-3): toISOString() puro vira o dia seguinte depois das 21h
export const hojeSLZ = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
export const horaSLZ = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(11, 16);
export function somaDias(dia, n) {
  const [a, m, d] = String(dia).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** "  Théo  SILVA" → "theo silva" — o mesmo paciente vindo de lugares diferentes. */
export const normalizarNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/** O dia do pós: o seguinte ao atendimento; se esse dia já passou, hoje; domingo vira segunda. */
export function diaDoPos(dataAtendimento, hoje) {
  let alvo = somaDias(dataAtendimento, 1);
  if (alvo < hoje) alvo = hoje;
  if (diaDaSemana(alvo) === 0) alvo = somaDias(alvo, 1);
  return alvo;
}

// "Não aconteceu" na língua dos três lugares: Cancelado/Faltou/Reagendado (agenda
// daqui), cancelado/faltou (VittaMed), falta/cancelada (sessões de terapia).
const NAO_ACONTECEU = /cancel|falt|remarc|reagend|desmarc/i;

/** O atendimento já aconteceu? Não cancelado/faltou/remarcado e o horário já passou. */
export function aconteceu(a, hoje, agoraHM) {
  if (!a || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.data || '')) || NAO_ACONTECEU.test(String(a.status || ''))) return false;
  if (a.data < hoje) return true;
  if (a.data > hoje) return false;
  const h = String(a.hora || '').slice(0, 5);
  return !/^\d{2}:\d{2}$/.test(h) || h <= agoraHM;
}

/**
 * O que criar e o que juntar.
 *  · atendimentos = [{ origem, paciente, responsavel_nome, telefone, conversa_id, setor, servico, profissional, data, hora, status }]
 *  · existentes   = pós já gravados (inclusive os excluídos pela equipe) [{ id, data, paciente, origens }]
 * Devolve { novos: [pós para gravar], juntar: [{ id, origem, servico }] }.
 * Origem já usada não volta (o pós que a equipe excluiu não renasce).
 */
export function planejarPosConsulta(atendimentos, existentes, { hoje, agoraHM }) {
  const usadas = new Set((existentes || []).flatMap(p => p.origens || []));
  const porChave = new Map();   // "dia|nome" → { id } (gravado) ou { novo }
  const noDia = new Map();      // dia → quantos pós já tem (para o horário)
  for (const p of existentes || []) {
    if (p.status !== 'Excluído') porChave.set(`${p.data}|${normalizarNome(p.paciente)}`, { id: p.id });
    noDia.set(p.data, (noDia.get(p.data) || 0) + 1);
  }
  const novos = [];
  const juntar = [];
  const ordem = [...(atendimentos || [])].sort((a, b) => `${a.data} ${a.hora || ''}`.localeCompare(`${b.data} ${b.hora || ''}`));
  for (const a of ordem) {
    if (!a?.origem || usadas.has(a.origem) || !String(a.paciente || '').trim() || !aconteceu(a, hoje, agoraHM)) continue;
    usadas.add(a.origem);
    const dia = diaDoPos(a.data, hoje);
    const chave = `${dia}|${normalizarNome(a.paciente)}`;
    const ja = porChave.get(chave);
    if (ja?.id) { juntar.push({ id: ja.id, origem: a.origem, servico: a.servico || null }); continue; }
    if (ja?.novo) {
      ja.novo.origens.push(a.origem);
      if (a.servico && !ja.novo.servicos.includes(a.servico)) ja.novo.servicos.push(a.servico);
      if (!ja.novo.telefone && a.telefone) ja.novo.telefone = a.telefone;
      if (!ja.novo.conversa_id && a.conversa_id) ja.novo.conversa_id = a.conversa_id;
      if (!ja.novo.responsavel_nome && a.responsavel_nome) ja.novo.responsavel_nome = a.responsavel_nome;
      continue;
    }
    const n = noDia.get(dia) || 0;
    noDia.set(dia, n + 1);
    const novo = {
      data: dia,
      // Lista do dia com hora, como o Pós Vacinal: 9:00, 10:00… (trava às 17h)
      hora: `${String(Math.min(9 + n, 17)).padStart(2, '0')}:00`,
      paciente: String(a.paciente).trim().slice(0, 120),
      responsavel_nome: a.responsavel_nome || null,
      telefone: a.telefone || null,
      conversa_id: a.conversa_id || null,
      setor: a.setor === 'terapias' ? 'terapias' : 'consultas',
      servicos: a.servico ? [a.servico] : [],
      profissional: a.profissional || null,
      data_atendimento: a.data,
      origens: [a.origem],
    };
    porChave.set(chave, { novo });
    novos.push(novo);
  }
  return { novos, juntar };
}

/**
 * O que desfazer: pós ainda PENDENTE cuja origem deixou de valer (virou falta,
 * cancelado, remarcado, foi apagada ou mudou de dia). `validas` = Set das
 * origens que valem agora; `conferivel(origem)` diz se deu para conferir
 * (VittaMed fora do ar não apaga nada). Origem inválida sai do pós; pós sem
 * nenhuma origem é apagado (se o atendimento voltar a valer, ele renasce).
 */
export function planejarLimpeza(pendentes, validas, conferivel) {
  const tirar = [];
  const apagar = [];
  for (const p of pendentes || []) {
    const origens = p.origens || [];
    const invalidas = origens.filter(o => conferivel(o) && !validas.has(o));
    if (!invalidas.length) continue;
    if (invalidas.length === origens.length) apagar.push(p.id);
    else tirar.push({ id: p.id, origens: invalidas });
  }
  return { tirar, apagar };
}
