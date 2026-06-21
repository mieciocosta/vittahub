# Candidatos a remoção — funcionalidades sem uso

_Revisado em 2026-06-21._

Lista de coisas que **parecem não estar mais em uso** (substituídas ou
desativadas). **Nada aqui foi apagado** — está só marcado pra você confirmar
antes de remover. Marque `[x]` no que puder tirar e eu removo com segurança.

> Como ler: ✅ = seguro remover (não é importado/chamado por nada);
> ⚠️ = inativo hoje, mas é uma integração que você pode querer reativar um dia.

---

## ✅ Arquivos mortos (não são importados em lugar nenhum)

- [ ] **`backend/src/data/mockData.js`** — dados de exemplo (conversas fake).
      Não é importado por nenhum arquivo. Sobrou da fase de protótipo.
- [ ] **`backend/src/data/db.js`** — "banco" em memória com conversas de teste
      (julinha.fc, marcos.saude_slz…). Substituído pelo PostgreSQL real.
      Não é importado por nada.
- [ ] **`backend/src/db/migrate.js`** — migration manual antiga. Hoje o schema
      é criado por `autoMigrate.js` (é o que o `index.js` chama no boot).
      Este arquivo não é mais referenciado.

## ⚠️ Webhooks de canais que não estão ativos

O canal ativo hoje é a **Z-API** (`/webhook/zapi`). Estes outros continuam no
código mas não recebem tráfego:

- [ ] **`POST /webhook/whatsapp`** (`inbox.js` ~linha 286) — webhook da
      **Evolution API**, o provedor de WhatsApp antigo. Trocado pela Z-API.
- [ ] **`GET/POST /webhook/instagram`** (`inbox.js` ~linha 422) — integração
      com Instagram (Meta) que nunca entrou em produção.
- [ ] **`GET/POST /webhook/meta`** (`inbox.js` ~linha 1862) — webhook da Meta
      Cloud API (WhatsApp oficial), também nunca ativado. Sem validação de
      assinatura (ver `SECURITY-AUDIT.md`) — se for reativar, adicionar antes.

> Se decidir tirar os 3 webhooks acima, dá pra remover junto as variáveis de
> ambiente correspondentes do `.env.example`: `EVOLUTION_API_URL`,
> `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `INSTAGRAM_ACCESS_TOKEN`,
> `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_PAGE_ID`.

## ⚠️ Fluxo antigo de meta por leads

- [ ] A meta de vacinas do painel **antes** somava `leads.valor_proposta`
      (status "Fechado"). Isso foi trocado pela tabela `vendas` (Registrar
      Venda) no commit de correção do Dashboard. O campo `valor_proposta` em
      `leads` e os status "Fechado/Venda Fechada" ainda existem e alimentam o
      **Funil de Vacinas** e a **taxa de conversão** — então **não remover**
      sem antes decidir se o funil passa a ler de `vendas` também.

---

## Itens verificados que **NÃO** são candidatos (estão em uso)

- `GET /reports/pdf-data` → usado em `Relatorios.jsx` (botão Gerar PDF).
- `autoMigrate.js`, `webhook/zapi`, tabela `vendas`, chat interno, auditoria.
