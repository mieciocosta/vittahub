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

/* EXAMES DE VERDADE que começam com "teste" — teste do pezinho, da orelhinha,
   do olhinho, do coraçãozinho, teste rápido, teste ergométrico. Numa clínica de
   pediatria isso aparece o tempo todo, em mensagem e em nome de arquivo. Um
   filtro que barra "Teste do pezinho.pdf" é pior que o problema que resolve. */
const CLINICO = /^teste[s]?\s+(d[oae]s?|r[áa]pid|ergom|de\s)/i;

export function pareceMensagemDeTeste(texto) {
  const t = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!t) return false;
  // Texto de verdade é maior que isso — acima de 60 caracteres nem avalia
  if (t.length > 60) return false;
  if (/^teste webhook vittahub/i.test(t)) return true;
  if (CLINICO.test(t)) return false;
  return PADRAO.test(t);
}

/* TÍTULO DE ARQUIVO (pedido do master: "não pode ser mensagem com título
   teste"). Um PDF chamado "Proposta-Teste.pdf" chega no cliente com esse nome
   escrito no balão — é mensagem de teste do mesmo jeito, mesmo com legenda
   vazia. Regra: o nome, sem a extensão, é teste quando ELE INTEIRO é um teste
   ("teste.pdf") ou quando termina em -teste / _teste / " teste"
   ("Proposta-Teste.pdf"). Exame de verdade continua passando pela exceção
   clínica acima. */
export function pareceArquivoDeTeste(nome) {
  const n = String(nome || '').trim().replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\s+/g, ' ');
  if (!n || n.length > 60) return false;
  if (CLINICO.test(n)) return false;
  if (pareceMensagemDeTeste(n)) return true;
  // "Proposta-Teste", "plano teste" — o teste no fim do nome
  if (/[-_ ]test(e|es|ando)?$/i.test(n)) return true;
  /* "Teste Envio", "Teste WhatsApp" — teste na FRENTE. Aqui a lista é fechada
     de propósito: só palavras de homologação. Assim "Teste sanguíneo.pdf" ou
     qualquer exame que eu não tenha previsto continua passando — errar pro lado
     de deixar passar é o certo neste filtro. */
  return /^test(e|es|ando)?[-_ ](envio|whats|zapi|api|webhook|sistema|integra|deploy|homolog|prod|final|novo|nova|\d)/i.test(n);
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
