# Guia de Integração — WhatsApp e Instagram

## WhatsApp via Evolution API

### 1. Subir a Evolution API no Railway (gratuito)

```bash
# Acesse railway.app e crie um novo projeto
# Selecione "Deploy from GitHub repo"
# Use: https://github.com/EvolutionAPI/evolution-api
```

Variáveis de ambiente no Railway:
```
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=minha_chave_secreta_vittalis
SERVER_URL=https://sua-api.up.railway.app
```

### 2. Conectar o número da Vittalis

1. Acesse o painel da Evolution API: `https://sua-api.up.railway.app/manager`
2. Clique em **"Criar instância"** → Nome: `vittalis`
3. Clique em **"Conectar"** → aparece um QR Code
4. Abra o WhatsApp Business do número da clínica
5. Vá em **Dispositivos conectados** → Escanear QR Code
6. ✅ Número conectado!

### 3. Configurar webhook para receber mensagens

No painel da Evolution API → Instância `vittalis` → **Webhook**:
- URL: `https://seu-crm.com/api/inbox/webhook/whatsapp`  
- Eventos: marque `messages.upsert`
- Salvar

### 4. Preencher o .env

```env
EVOLUTION_API_URL=https://sua-evolution-api.up.railway.app
EVOLUTION_API_KEY=minha_chave_secreta_vittalis
EVOLUTION_INSTANCE=vittalis
```

---

## Instagram via Meta Graph API

### 1. Criar app no Meta for Developers

1. Acesse: https://developers.facebook.com/apps
2. Clique em **Criar app** → Tipo: **Business**
3. No painel do app, clique em **Adicionar produto** → **Mensagens do Instagram**

### 2. Conectar a conta do Instagram da Vittalis

1. A conta do Instagram precisa ser **Profissional/Business**
2. Em **Configurações** → **Instagram** → conecte a conta
3. Gere um **token de acesso de página** de longa duração

### 3. Configurar o webhook

1. No painel do app → **Webhooks** → Inscrever
2. URL de callback: `https://seu-crm.com/api/inbox/webhook/instagram`
3. Token de verificação: `vittalis_webhook_2024`
4. Eventos: marque `messages`

### 4. Preencher o .env

```env
INSTAGRAM_ACCESS_TOKEN=EAAxxxxx...
INSTAGRAM_VERIFY_TOKEN=vittalis_webhook_2024
INSTAGRAM_PAGE_ID=123456789
```

---

## Resumo IA (Anthropic)

O botão **"Resumo IA"** usa a API da Anthropic para analisar a conversa e sugerir próximo passo.

1. Crie uma conta em https://console.anthropic.com
2. Gere uma API Key
3. Adicione ao .env:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

Sem a chave, o sistema retorna um resumo genérico mockado.

---

## Riscos e considerações

| Método | Risco de bloqueio | Custo | Recomendado |
|--------|------------------|-------|-------------|
| Evolution API (WhatsApp Web) | Baixo (~5% com uso normal) | Gratuito | ✅ Para MVP |
| WhatsApp Business API oficial | Zero | ~R$100/mês | ✅ Para produção |
| Instagram Graph API | Zero | Gratuito (oficial) | ✅ |

**Dica:** Use o número do WhatsApp Business dedicado à clínica (não o pessoal). A Evolution API conecta via WhatsApp Web, então o celular precisa estar com internet. Para maior estabilidade, use um chip dedicado no celular da recepção.
