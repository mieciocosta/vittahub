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
- **Permissões**: `master` = Dr. Miécio (impersonação exclusiva dele — gate regex `/mi[eé]cio/i` + SUPER_ADMIN_ID); `supervisor` = gestão; atendentes veem só seu setor/carteira. Excluir conversa = gestão. Valores de vendas do dia = gestão.
- **Versículo do dia**: lista única de 110 versos em `frontend/src/hooks/versiculos.js` ESPELHADA em `backend/src/versiculos.js` — o devocional diário (`/extras/amigo/devocional-hoje`, cache em `configuracoes.devocional_dia`) nasce do verso do dia. Se mudar uma lista, mude a outra.
- **Notificações**: `apenas_master=true` esconde do resto da equipe (alertas de segurança).

## Convenções
- Commits em PT sem acento no título, mensagens descritivas; push direto na `main` (fluxo aprovado pelo dono).
- Comentários de código em PT-BR, tom do projeto (explicam o PORQUÊ; citam "pedido do master" quando for regra dele).
- Respostas ao usuário: PT-BR, calorosas, com emojis moderados; sempre avisar "no ar em ~3 min + Ctrl+Shift+R".
- Patches grandes via python heredoc com `assert` de contagem antes de gravar; `cd /home/user/vittahub` sempre (o cwd reseta entre comandos).

## Armadilhas conhecidas
- Duas sessões podem trabalhar em paralelo: `git pull --rebase origin main` se o push falhar.
- Sandbox sem rede externa (proxy 403): não valide URLs de YouTube/sites; Puppeteer local usa `executablePath /opt/pw-browsers/.../chrome` e `waitUntil:'load'` (networkidle trava).
- `window.prompt`/`confirm` falham em webview mobile — use popups próprios.
- Railway congela deploys se a assinatura atrasar (sintoma: "mudança não aparece").
