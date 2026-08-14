/* 🚨 FREIO DE MENSAGEM DE TESTE — a última tranca antes do WhatsApp do cliente.
   (pedido do master: "está aparecendo mensagem de teste para o cliente / não
   quero que apareça nada disso".)

   Por que aqui e não em cada lugar: o VittaHub tem MUITAS portas de envio — a
   Vitta respondendo, o menu, follow-up, resgate, lembretes, fila agendada, o
   Chat, a ponte de integração com o VittaSys/VittaMed e os endpoints de
   diagnóstico. Bloquear "teste" em uma delas só empurra o problema pra outra.
   Este arquivo é a tranca única: TODO envio de texto passa por aqui.

   O que é bloqueado: mensagem cujo conteúdo INTEIRO é um teste — "teste",
   "test", "testando", "teste 1", "Teste webhook VittaHub 14:32". Não é uma
   busca pela palavra: "vou testar a dose amanhã" e "teste do pezinho" passam
   normalmente, porque são texto de verdade e não caem no padrão.

   Fail-safe do fail-safe: na dúvida o texto PASSA. Bloquear conversa legítima
   seria pior que deixar escapar um "teste". */

const PADRAO = /^(oi\s+|ola\s+|olá\s+)?(teste|test|testando|testes|testagem|teste de envio|teste do sistema|mensagem de teste|msg de teste|testando 123)([\s.!?\-–—:,]*\d*)?$/i;

export function pareceMensagemDeTeste(texto) {
  const t = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!t) return false;
  // Texto de verdade é maior que isso — acima de 60 caracteres nem avalia
  if (t.length > 60) return false;
  if (/^teste webhook vittahub/i.test(t)) return true;
  return PADRAO.test(t);
}

/* Registra e avisa o master. Recebe a `query` de fora porque este serviço não
   deve depender do pool (evita import circular com as rotas). */
export async function avisarTesteBloqueado(query, { texto, destino, origem }) {
  console.warn(`🚨 MENSAGEM DE TESTE BLOQUEADA · origem=${origem} destino=${destino} texto=${JSON.stringify(String(texto).slice(0, 60))}`);
  try {
    await query(
      `INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
      ['🚨 Mensagem de teste bloqueada',
       `Uma mensagem com o texto "${String(texto).slice(0, 40)}" ia sair para ${destino || 'um cliente'} (origem: ${origem}). O envio foi cancelado antes de chegar no WhatsApp.`]);
  } catch { /* o alerta é bônus; o que importa é a mensagem não ter saído */ }
}
