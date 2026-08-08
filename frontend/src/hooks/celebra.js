/* 🎉 PARABÉNS + DIRECIONAMENTO — a cada agendamento registrado.
   Regra do master: sempre comemorar, e na sequência apontar o próximo foco
   (Planos Vacinais e Pacote Mensal), lembrando as facilidades de pagamento
   que ajudam a fechar. As frases giram pra não virar paisagem. */

const PARABENS = [
  '🎉 Parabéns! Mais um agendamento garantido!',
  '👏 Isso! Agendamento registrado com sucesso!',
  '🚀 Muito bem! Mais uma família cuidada pela Vittalis!',
  '💙 Excelente! Agendamento confirmado na agenda!',
  '⭐ Boa! Seu esforço está virando resultado!',
];

// Facilidades de pagamento — o que costuma destravar o "vou pensar"
export const FACILIDADES = [
  'entrada de 50% e o restante em 30 dias, sem juros',
  'entrada hoje e o saldo só no mês que vem',
  'parcelamento no cartão em até 12x',
  'Pix à vista com condição especial',
  'primeira parcela na aplicação e as demais no mesmo dia dos meses seguintes',
];

const FOCOS = [
  'Vamos atacar mais em **Planos Vacinais** e **Pacote Mensal**',
  'Foco do time: **Planos Vacinais** e **Pacote Mensal**',
  'Próximo passo: oferecer **Plano Vacinal** ou **Pacote Mensal**',
];

/** Mensagem de comemoração + direcionamento (texto puro, pronto pro Toast). */
export function mensagemAgendamento() {
  const p = PARABENS[Math.floor(Math.random() * PARABENS.length)];
  const f = FOCOS[Math.floor(Math.random() * FOCOS.length)].replace(/\*\*/g, '');
  const fac = FACILIDADES[Math.floor(Math.random() * FACILIDADES.length)];
  return `${p}\n💡 ${f} — ofereça ${fac}.`;
}
