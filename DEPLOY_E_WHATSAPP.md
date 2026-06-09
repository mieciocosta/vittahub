# 💎 VittaHub — Guia Completo de Deploy e Integração WhatsApp

---

## ✅ SITUAÇÃO ATUAL
- Backend: `https://vittahub-backend-production.up.railway.app` ✓
- Frontend: `https://vittahub-frontend-production.up.railway.app` ✓
- PostgreSQL: Railway ✓
- WhatsApp real: **pendente** (ver passo a passo abaixo)

---

## 🔧 PASSO 1 — Variáveis de Ambiente no Railway

### No serviço `vittahub-backend`, adicione em Settings → Variables:

```
DATABASE_URL          = (já preenchido pelo Railway automaticamente)
JWT_SECRET            = vittahub_super_secret_2024_change_this
NODE_ENV              = production
FRONTEND_URL          = https://vittahub-frontend-production.up.railway.app
EVOLUTION_API_URL     = https://sua-evolution.up.railway.app    ← preencher depois
EVOLUTION_API_KEY     = sua_chave_evolution                     ← preencher depois
EVOLUTION_INSTANCE    = vittalis
ANTHROPIC_API_KEY     = sk-ant-...                              ← opcional, para IA
```

### No serviço `vittahub-frontend`, adicione:

```
VITE_API_URL          = https://vittahub-backend-production.up.railway.app
```

---

## 🔧 PASSO 2 — Rodar Migrations no PostgreSQL

Depois de fazer deploy do backend, abra o Railway Shell do serviço backend e execute:

```bash
node src/db/migrate.js
node src/db/seed.js
```

Ou simplesmente faça deploy — o backend roda auto-migrate na inicialização.

---

## 📱 PASSO 3 — Conectar WhatsApp Real (Evolution API)

### O que é Evolution API?

É uma API gratuita e open source que conecta ao WhatsApp Web
via QR Code. É a mesma tecnologia que a maioria dos CRMs brasileiros usa.

**Repositório:** https://github.com/EvolutionAPI/evolution-api

---

### 3.1 Deploy da Evolution API no Railway

1. Acesse https://railway.app → New Project → Deploy from GitHub
2. Fork o repositório: https://github.com/EvolutionAPI/evolution-api
3. Crie um novo serviço no seu projeto Railway com esse fork
4. Configure as variáveis:

```
AUTHENTICATION_TYPE      = apikey
AUTHENTICATION_API_KEY   = CHANGE_ME_SUA_CHAVE_SECRETA
SERVER_URL               = https://sua-evolution.up.railway.app
WEBHOOK_GLOBAL_URL       = https://vittahub-backend-production.up.railway.app/api/inbox/webhook/whatsapp
WEBHOOK_GLOBAL_ENABLED   = true
WEBHOOK_EVENTS_MESSAGES_UPSERT = true
```

5. Aguarde o deploy. A URL pública será algo como:
   `https://evolution-api-production-xxxx.up.railway.app`

---

### 3.2 Criar instância WhatsApp

Com a Evolution API rodando, execute no terminal (ou use Postman/Insomnia):

```bash
curl -X POST https://SUA-EVOLUTION.up.railway.app/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: CHANGE_ME_SUA_CHAVE_SECRETA" \
  -d '{
    "instanceName": "vittalis",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

---

### 3.3 Conectar com QR Code

```bash
curl -X GET https://SUA-EVOLUTION.up.railway.app/instance/connect/vittalis \
  -H "apikey: CHANGE_ME_SUA_CHAVE_SECRETA"
```

A resposta terá um campo `base64` com o QR Code.
Abra o link no navegador ou cole o base64 em https://base64.guru/converter/decode/image

**No celular:** WhatsApp → Menu (3 pontos) → Aparelhos conectados → Conectar aparelho → Escanear QR

---

### 3.4 Verificar conexão

```bash
curl -X GET https://SUA-EVOLUTION.up.railway.app/instance/fetchInstances \
  -H "apikey: CHANGE_ME_SUA_CHAVE_SECRETA"
```

Status deve aparecer como `"state": "open"` — isso significa WhatsApp conectado!

---

### 3.5 Configurar variáveis no VittaHub

No Railway, no serviço `vittahub-backend`, atualize:

```
EVOLUTION_API_URL  = https://SUA-EVOLUTION.up.railway.app
EVOLUTION_API_KEY  = CHANGE_ME_SUA_CHAVE_SECRETA
EVOLUTION_INSTANCE = vittalis
```

Faça redeploy do backend. Agora toda mensagem recebida no WhatsApp vai aparecer no Inbox do VittaHub!

---

### 3.6 Testar

Envie uma mensagem para o número conectado pelo WhatsApp de outro celular.
Aguarde 5 segundos e recarregue o Inbox. A conversa deve aparecer.

---

## 📸 PASSO 4 — Conectar Instagram (opcional)

O Instagram requer uma conta comercial + página do Facebook.

### Requisitos:
- Conta Instagram Business ou Creator
- Página do Facebook vinculada
- App Meta for Developers (https://developers.facebook.com)

### Passos:
1. Crie um App no Meta for Developers → Tipo: Business
2. Adicione o produto "Messenger" (que inclui Instagram)
3. Configure o Webhook:
   - URL: `https://vittahub-backend-production.up.railway.app/api/inbox/webhook/instagram`
   - Token de verificação: `vittahub_2024` (configurado no backend)
   - Campos: `messages`
4. Gere o Access Token permanente e adicione em:
   ```
   INSTAGRAM_ACCESS_TOKEN   = EAAxx...
   INSTAGRAM_VERIFY_TOKEN   = vittahub_2024
   ```

---

## 🗄️ PASSO 5 — PostgreSQL (referência)

O banco já foi criado pelo Railway. O VittaHub usa auto-migrate na inicialização.

### Tabelas criadas automaticamente:
- `usuarios` — equipe VittaHub
- `leads` — funil comercial com índices de busca
- `conversas` — inbox WhatsApp/Instagram
- `mensagens` — histórico de chat
- `respostas_rapidas` — templates
- `notificacoes` — alertas
- `configuracoes` — bot, integrações

### Acessar banco via Railway:
No serviço PostgreSQL → Connect → clique em "psql" para abrir terminal SQL.

---

## 🚀 PASSO 6 — Deploy contínuo

O deploy já está configurado via GitHub Actions. Ao fazer push na branch `main`:
1. Railway detecta automaticamente
2. Faz build do frontend e backend
3. Aplica migrations automaticamente
4. Reinicia serviços

---

## 🔑 Logins

| Usuário | Email | Senha |
|---------|-------|-------|
| Miecio (Master) | miecio@vittalissaude.com.br | vittalis123 |
| Nágila | nagila@vittalissaude.com.br | vittalis123 |
| Raquel | raquel@vittalissaude.com.br | vittalis123 |
| Thales | thales@vittalissaude.com.br | vittalis123 |

---

## ⚡ Performance — 2000+ conversas

O VittaHub v2 usa:

- **Virtual scroll**: só renderiza as ~15 linhas visíveis na tela — não importa se há 200 ou 20.000 conversas
- **Paginação**: carrega 50 por vez, busca mais ao rolar até o fim
- **Debounce na busca**: espera 300ms após o usuário parar de digitar
- **Índices PostgreSQL**: busca por nome usa `pg_trgm` (trigram), extremamente rápido
- **Query paralela**: dashboard faz 8 queries ao mesmo tempo com Promise.all
- **React.memo**: componentes de conversa e mensagem só re-renderizam quando os dados mudam

---

## 🆘 Problemas Comuns

### "Failed to execute 'json' on 'Response'"
→ Variável `VITE_API_URL` não está configurada no frontend Railway.
→ Adicione: `VITE_API_URL = https://vittahub-backend-production.up.railway.app`

### "Not allowed by CORS"
→ Adicione no backend: `FRONTEND_URL = https://vittahub-frontend-production.up.railway.app`

### Login não funciona em produção
→ Verifique se o banco PostgreSQL tem usuários (rode o seed)
→ Verifique se `JWT_SECRET` está configurado no backend

### WhatsApp desconecta
→ QR Code expira. Reconecte via: `GET /instance/connect/vittalis`
→ Para manter conectado permanentemente, use um servidor dedicado (VPS) para a Evolution API

---

## 📞 Suporte
Dúvidas técnicas sobre integração WhatsApp: consulte a documentação oficial da Evolution API em https://doc.evolution-api.com
