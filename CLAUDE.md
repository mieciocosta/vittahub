# VittaHub CRM — Vittalis Saúde (São Luís-MA)

CRM de WhatsApp para clínica de pediatria/vacinação. Dono/master: Dr. Miécio (fala português; trate-o em PT-BR).

## Stack e deploy
- **Backend**: Node ESM + Express em `backend/src` (rotas gigantes: `routes/inbox.js` ~6k linhas, `routes/extras.js`). PostgreSQL (Railway), migrações idempotentes em `db/autoMigrate.js` (rodam no boot). Socket.io + PG NOTIFY.
- **Frontend**: React + Vite em `frontend/src`. Estilos inline (sem Tailwind). Build: `cd frontend && npm run build`.
- **Deploy**: push na `main` → Railway auto-deploya em ~3 min. NÃO existe staging; o usuário testa em produção. Sempre `node --check` nos arquivos de backend e `npm run build` no frontend antes de commitar.
- **WhatsApp**: gateway Z-API (envio/webhooks). **IA**: Claude via adaptador `openaiMessages()` em `inbox.js` (roteia para `claudeMessages`); modelo principal = `claude-opus-5` (passar `model:'gpt-4o'`), mini = haiku (`model:'gpt-4o-mini'`). NUNCA enviar `effort` para haiku. Whisper (OPENAI_API_KEY) transcreve áudios.

## Regras de negócio que custaram caro aprender
- **Fuso**: São Luís = UTC-3. `toISOString()` para "hoje" QUEBRA depois das 21h. Use data local no frontend (`hojeLocalISO`) e `Date.now() - 3*3600*1000` no backend. Crons usam hora UTC (20h UTC = 17h SLZ).
- **Bot da Vitta**: o botão `bot_ativo` POR CONVERSA é soberano. Interruptores globais (Configurações) controlam só o comportamento automático (menu, reabertura 24h). Atendente responder → bot desliga naquela conversa.
- **Mensagens automáticas**: tudo passa por `mensagens_agendadas` + `processarAgendadas` (tick 60s). Identifique a origem em `criado_por` ('Vitta · …') — o card "Vitta trabalhando" do Dashboard agrupa por esse campo.
- **Privacidade anti-furto de clientes** (`middleware/privacidade.js`): telefones mascarados nas LISTAS para não-gestão (conversa aberta mantém completo); detector de varredura (40+ conversas/10min → alerta ao master, 80+ → 429); sessão da equipe expira em 16h; frontend bloqueia copiar telefone (SecurityLock em App.jsx).
- **Papéis (regra que já custou 4 vazamentos)**: `supervisor` NÃO é gestão da clínica — é **supervisora do próprio setor**, e acumula o papel de atendente (Raylane: vacinas + fidelidade, com meta própria; Danielle: consultas + terapias). Ao escrever qualquer filtro, pergunte: *é do setor dela ou da clínica inteira?*
  - **Setor dela** (agenda, pastas, placar, total do setor, metas do setor) → `master || supervisor`, com os setores já filtrados por `setores`/`setor`.
  - **Clínica inteira ou linha de cada colega** (produtividade nominal, faturamento da casa, campeã do dia, impersonação) → **só `master`**. Raylane e Stefany são do MESMO setor e não podem ver o número uma da outra.
  - Nunca use `ve_tudo` como atalho de "é gestão": Danielle tem `ve_tudo` (pra enxergar as conversas) e caiu em 3 filtros errados por causa disso. O que manda é `setor`/`setores`.
- **Carteira Fidelidade é fechada (27/08, ajustada em 28/08)**: a pasta Fidelidade e tudo que estiver na mão de quem tem `so_fidelidade` (Poliana) só aparece pra ELA, pra GESTÃO (`ehGestao`: master, supervisora, `ve_tudo`) e pra quem for a responsável direta da conversa — colega de setor sem cargo NÃO vê. A regra mora em `podeVerSetor` e a pasta some do menu de quem não é da carteira.
- **Trocar assinatura é SÓ do master (27/08)**: o 👤 dentro de cada mensagem enviada, o atalho em lote (⋯ Mais) e o "assinar como" na hora de escrever são exclusivos do master — supervisora não troca nome de ninguém. A tela nunca mostra pronome de tratamento como nome ("Dra. Nágila" exibe "Nágila").
- **Fila de leads é da equipe (04/09, revogou o modelo de 28/08)**: conversa SEM responsável aparece pra equipe toda, numa fila ÚNICA e igual pra todas (sem separar por setor: "quero que todas recebam o mesmo"), se teve mensagem nos últimos 7 dias (o passado fica fora). O setor só separa conversa que já tem dona. Quem responde 2x assume (`podeAssumirSozinha`), menos perfis de carteira fechada (`so_carteira`, `so_fidelidade`). O sistema NUNCA distribui sozinho (rodízio desligado). A Danielle continua com a aba "📥 Distribuição" (`usuarios.distribuidor`) pra entregar na mão quando quiser, mas não é mais dona exclusiva da fila. **Gabriellen = `so_carteira`**: só vê o que for entregue no nome dela ("somente o que Danielle passar").
- **Poliana vê só o que é dela (28/08)**: `so_fidelidade` passou a significar apenas `responsavel_id === ela` — não vê mais a pasta Fidelidade inteira. Cliente novo de fidelidade chega pela distribuição.
- **Exceção "mostrar pra equipe toda"**: `conversas.visivel_todos` fura QUALQUER trava (setor, carteira, pasta) — é a primeira regra de `podeVerSetor`. Só o master liga, pelo menu ⋯ da conversa. Nasceu da Dra. Nágila Maria (27/08), que fica na pasta Fidelidade mas precisa aparecer pra todos.
- **Transferiu, sumiu**: `conversas.transferida_por` guarda quem passou o atendimento adiante; a conversa some pra essa pessoa em qualquer carregamento (menos pro master). Devolver ao pool (assign sem responsável) zera a marca.
- **Permissões**: `master` = Dr. Miécio (impersonação exclusiva dele — gate regex `/mi[eé]cio/i` + SUPER_ADMIN_ID); `supervisor` = gestão; atendentes veem só seu setor/carteira. Excluir conversa = gestão. Valores de vendas do dia = gestão.
- **Cartão oficial de agendamento (FIXO, ordem do master)**: fonte ÚNICA em `backend/src/services/cartaoAgenda.js` (`cartaoAgendamento`/`cartaoDoEvento`). TODA confirmação e TODO lembrete saem de lá: IA (`pre_agendar`), agenda do CRM (`POST /inbox/cartao-agendamento`), menu de boas-vindas, confirmação de véspera (`extras.js`) e lembretes (`lembretes.js`). O lembrete é o MESMO cartão, mudando só título e frase inicial. NUNCA montar confirmação solta em outro ponto (foi assim que o texto derivou 2x). Endereço + Maps só quando não é residência; Instagram sempre; nunca mandar valor/parcelamento ao cliente nesse cartão.
- **Cartão é UM só para os três setores (27/08)**: mesmo corpo para vacinas, consultas e terapias; muda só o TÍTULO (Vacinação/Consulta/Sessão de terapia confirmada). Bloco do endereço ditado verbatim: as 4 linhas, linha em branco, e `🗺️ Nosso endereço pelo Google Maps: <link>`.
- **Cartão vira agenda sozinho (27/08)**: mandou o cartão oficial no chat, o evento entra em `agenda_eventos` na hora (só o cartão; data solta no texto não vira compromisso; nunca duplica mesma conversa+data+hora). O botão Agendar lê o cartão da conversa e chega preenchido — `lerAgendamentoDoTexto` em `inbox.js` é a régua, sem IA.
- **Textos ditados pelo dono são LEI (verbatim)**: ex. resposta de plano de saúde ("Nós atendemos somente de forma particular…"). Não reescrever, não resumir, não trocar palavra — e sem travessões nem aspas em NENHUM texto-modelo do prompt (o sanitizer `semTravessao` limpa a saída, mas os exemplos ensinam o estilo).
- **Pós-vacinal**: nasce SÓ na agenda (D+1 do atendimento de vacinas, ou HOJE se o D+1 já passou), para a atendente realizar. Nenhuma mensagem automática sobre pós-vacinal vai ao cliente — confirmação de véspera, lembretes automáticos e envio manual excluem `servico = 'Pós Vacinal'`.
- **Versículo do dia**: lista única de 110 versos em `frontend/src/hooks/versiculos.js` ESPELHADA em `backend/src/versiculos.js` — o devocional diário (`/extras/amigo/devocional-hoje`, cache em `configuracoes.devocional_dia`) nasce do verso do dia. Se mudar uma lista, mude a outra.
- **Notificações**: `apenas_master=true` esconde do resto da equipe (alertas de segurança).

## Convenções
- Commits em PT sem acento no título, mensagens descritivas; push direto na `main` (fluxo aprovado pelo dono).
- Comentários de código em PT-BR, tom do projeto (explicam o PORQUÊ; citam "pedido do master" quando for regra dele).
- Respostas ao usuário: PT-BR, calorosas, com emojis moderados; sempre avisar "no ar em ~3 min + Ctrl+Shift+R".
- Patches grandes via python heredoc com `assert` de contagem antes de gravar; `cd /home/user/vittahub` sempre (o cwd reseta entre comandos).

## Antes de commitar frontend (regra que nasceu de duas telas brancas em 01/09)
1. `cd frontend && npm run build` — o básico, mas **não pega erro de execução**.
2. `npx eslint --config lint-tdz.config.mjs src/pages/X.jsx` — a regra `no-use-before-define` é a que
   pega o "Cannot access 'X' before initialization" que derruba o app inteiro. Nem todo aviso é bug:
   referência dentro de callback/efeito é segura (roda depois do corpo do componente); o que MATA é uso
   na hora do render — array de dependências de `useEffect`, valor inicial de `useState`, JSX.
3. Carregar os chunks num Chromium de verdade (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` +
   puppeteer-core, servindo `dist` com http-server) e conferir `pageerror` no console.

## Armadilhas conhecidas
- Duas sessões podem trabalhar em paralelo: `git pull --rebase origin main` se o push falhar.
- Sandbox sem rede externa (proxy 403): não valide URLs de YouTube/sites; Puppeteer local usa `executablePath /opt/pw-browsers/.../chrome` e `waitUntil:'load'` (networkidle trava).
- `window.prompt`/`confirm` falham em webview mobile — use popups próprios.
- Railway congela deploys se a assinatura atrasar (sintoma: "mudança não aparece").
