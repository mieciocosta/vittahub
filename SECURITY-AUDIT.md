# Auditoria de Segurança — VittaHub

_Última revisão: 2026-06-21_

Varredura completa do sistema atrás de SQL injection, ataques, vazamento de
senha/informações e forja de webhooks. Abaixo o que foi verificado, o que foi
corrigido e o que fica como observação de baixo risco.

## ✅ Corrigido nesta auditoria

| Risco | O que foi feito |
|-------|-----------------|
| **SQL Injection** (ids de usuário interpolados em filtros) | Todos os ids usados em texto de SQL passam por `String(id).replace(/[^a-zA-Z0-9-]/g, '')` (charset de UUID). Arquivos: `inbox.js`, `reports.js`, `leads.js`, `extras.js`. Todo valor vindo do usuário usa _placeholder_ `$N` parametrizado — nunca concatenação. |
| **Força bruta no login** | Rate-limit por IP: máx. 10 falhas em 10 min → `429`. Mapa em memória com limpeza periódica. (`auth.js`) |
| **Vazamento de erro interno no login** | O `catch` do login não devolve mais `err.message` (que podia expor detalhe do banco). Agora: log no servidor + `"Erro interno. Tente novamente."` ao cliente. |
| **Forja de webhook Z-API** | O endpoint `/webhook/zapi` era público e sem validação. Agora descarta silenciosamente qualquer payload cujo `instanceId` não bata com `ZAPI_INSTANCE`. Sem isso, quem descobrisse a URL poderia injetar conversas/mensagens falsas. |

## ✅ Verificado e já estava seguro

- **Segredos no repositório:** nenhum. `JWT_SECRET`, tokens da Z-API e chave da
  OpenAI/Anthropic ficam só nas variáveis de ambiente do Railway. Os arquivos
  versionados (`.env.example`, `.env.production`) têm apenas _placeholders_ e a
  URL pública do backend. `.env` está no `.gitignore`.
- **JWT_SECRET sem fallback:** se a variável faltar, o servidor **não sobe**
  (evita assinar tokens com um segredo público versionado, que permitiria forjar
  um token de master). (`middleware/auth.js`)
- **Senhas:** sempre via `bcrypt`. O login devolve um objeto de usuário
  sanitizado — o hash nunca sai da API.
- **Revogação de acesso:** usuário desativado tem o token cortado na hora
  (conjunto `inativos` em memória, atualizado a cada 15s + revogação imediata
  ao desativar pela tela). Não espera o token de 30 dias expirar.
- **CORS:** lista branca explícita (frontend da Vitta + `*.vittalissaude.com.br`
  + o frontend oficial no Railway). **Não** confia em qualquer `*.railway.app`.
- **XSS:** nenhum uso de `dangerouslySetInnerHTML` no frontend.
- **Rotas autenticadas:** todas atrás de `auth` (JWT); ações sensíveis exigem
  `role === 'master'`. O `setor` vai no token e é reforçado no banco na janela
  de boot (antes do cache carregar).
- **Upload de avatar:** valida _mime_ (`jpeg/png/webp`) e tamanho (≤ 200 KB).
- **Parâmetros de período (`days`):** validados contra lista `[7, 30, 90]` —
  nunca interpolam entrada crua.

## ⚠️ Observações de baixo risco (não alteradas)

- **`err.message` em alguns 500 autenticados** (ex.: `GET /me`, `PUT /usuarios`,
  relatórios). Exige token válido para ser atingido e várias mensagens são
  validações úteis exibidas ao usuário (ex.: "CPF já cadastrado"). Trocar em
  massa degradaria a UX sem ganho real de segurança. Mantido.
- **Webhook do Instagram/Meta** (`/webhook/instagram`): provider **inativo** (o
  ativo é a Z-API). Usa `INSTAGRAM_VERIFY_TOKEN` no _handshake_ mas não valida
  assinatura `X-Hub-Signature` nos POSTs. Se um dia o Instagram for reativado,
  adicionar a validação de assinatura HMAC.
- **`/uploads` servido estático sem auth:** URLs não são adivinháveis; o caminho
  ativo de mídia passa pelo banco (`biblioteca_midias`). Baixo risco.
- **Validade do JWT = 30 dias:** conveniente para a equipe; mitigado pela
  revogação imediata de acesso. Reduzir para 7 dias se quiser endurecer.

## Recomendação operacional

- **Rotacionar a chave da OpenAI** que foi compartilhada em chat durante o
  desenvolvimento (boa prática — qualquer segredo que trafega por canais de
  conversa deve ser considerado exposto).
