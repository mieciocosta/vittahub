/* ⏸️ POLL QUE DORME COM A ABA ESCONDIDA (pedido do master, 03/09: "melhorar o
   desempenho sem impactar no sistema").

   O CRM fica aberto o dia inteiro em várias abas e tablets — e cada uma delas
   seguia perguntando ao servidor (sino, badges do menu, placar, mensagens
   novas) mesmo minimizada, atrás de outra aba, com a tela apagada. Era tráfego
   e banco gastos com ninguém olhando.

   Regra: com a aba escondida, o tick é pulado; ao voltar, roda NA HORA e
   retoma o ritmo. Quem está olhando não percebe diferença nenhuma — o dado
   chega na mesma cadência de sempre. Só muda o que acontecia às escuras.

   Uso: `load(); return aoVivo(load, 30000);` dentro de um useEffect (devolve
   a função de limpeza). Quem já tem outra limpeza guarda o retorno e chama
   junto. */
export function aoVivo(fn, ms) {
  let t = null;
  const tick = () => { if (!document.hidden) fn(); };
  const start = () => { if (t) clearInterval(t); t = setInterval(tick, ms); };
  const onVis = () => { if (!document.hidden) { fn(); start(); } };
  document.addEventListener('visibilitychange', onVis);
  start();
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
}
