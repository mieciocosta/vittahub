# 💎 VittaHub — CRM Vittalis Saúde

CRM comercial completo integrado ao VittaSys.

---

## ▶️ Como rodar (2 terminais)

### Terminal 1 — Backend (API)
```bash
cd backend
npm install
npm run dev
```
→ API rodando em **http://localhost:3001**

### Terminal 2 — Frontend (App)
```bash
cd frontend
npm install
npm run dev
```
→ App rodando em **http://localhost:3000**

Abra `http://localhost:3000` no navegador.

---

## 🔐 Logins

| Nome | E-mail | Senha | Perfil |
|------|--------|-------|--------|
| Miecio Costa | miecio@vittalissaude.com.br | vittalis123 | 👑 **Master** |
| Nágila Santos | nagila@vittalissaude.com.br | vittalis123 | Atendente |
| Raquel Ferreira | raquel@vittalissaude.com.br | vittalis123 | Atendente |
| Thales Oliveira | thales@vittalissaude.com.br | vittalis123 | Atendente |

**Diferença Master × Atendente:**
- Master vê todos os valores financeiros, faturamento, ticket médio, ranking com R$
- Master pode excluir leads e acessar Configurações
- Atendentes não veem valores monetários

---

## ✅ Funcionalidades VittaHub v1.0

### 📊 Dashboard
- KPIs: total leads, hoje, fechados, conversão, faturado (master), ticket médio
- Gráfico de área: leads × fechados nos últimos 7 dias
- Gráfico de pizza: distribuição por status
- Gráfico de barras: leads por canal de origem
- Ranking de atendentes (master)
- Alertas visuais: retornos vencidos + retornos para hoje

### 💬 Inbox (WhatsApp + Instagram)
- Chat completo com suporte a texto, imagem, áudio, vídeo, documentos
- **Visualização de imagens em lightbox** — clique para ampliar
- **Player de áudio nativo** para mensagens de voz
- **Gravação de microfone** — clique em 🎙️ para gravar
- Upload de arquivos (PDF, Word, Excel, imagens, vídeos)
- **Respostas rápidas** (botão #) — 9 templates, 1 clique para usar
- **Resumo IA** — analisa a conversa e gera insights comerciais
- **Botão Lead** — cria lead no funil com 1 clique, sem duplicação
- **Botão Proposta** — busca planos e vacinas do VittaSys e envia no chat
- **Bot ON/OFF** por conversa
- Separadores de data nas mensagens
- Status de entrega ✓✓

### 🤖 Bot de Atendimento
- Menu automático numerado (1-4 opções)
- Transferência para atendente após N mensagens (configurável)
- Round-robin automático: lead cai para o próximo atendente disponível
- Ativação global em Configurações

### 👥 Leads
- Busca por nome, telefone e e-mail em tempo real
- Filtros por status e origem
- Cadastro por chips — clique no canal, interesse, tags (zero digitação)
- Retornos vencidos marcados com ❗
- Retornos de hoje marcados com ⚠️
- Botão WhatsApp abre conversa com mensagem automática
- Master: coluna de valor proposta; atendente: coluna oculta
- Auto-atribuição round-robin se responsável em branco

### 🗂️ Funil Kanban
- 6 colunas: Novo lead → Em atendimento → Orçamento → Aguardando → Fechado → Perdido
- Drag-and-drop entre colunas com persistência
- Valor total por coluna (master)
- Tags, data de retorno e observações visíveis nos cards

### 📈 Relatórios
- KPIs consolidados + individuais
- Gráficos de barras, pizza, área (Recharts)
- Barras de progresso de conversão por canal
- Motivos de perda
- Ranking com valores (master)
- **Exportar PDF** com logo Vittalis, tabelas formatadas, marca d'água
- PDF gerado 100% no cliente (window.print)

### ⚙️ Configurações (Master)
- Editar mensagem de boas-vindas do bot
- Ativar/desativar bot global
- Configurar transferência após N msgs
- CRUD de respostas rápidas
- Visualizar usuários ativos
- Link direto para VittaSys

---

## 🔗 Integrações (Produção)

Crie o arquivo `backend/.env`:

```env
# WhatsApp (Evolution API)
EVOLUTION_API_URL=https://sua-evolution.up.railway.app
EVOLUTION_API_KEY=sua_chave
EVOLUTION_INSTANCE=vittalis

# Instagram (Meta Graph API)
INSTAGRAM_ACCESS_TOKEN=EAAxx...
INSTAGRAM_VERIFY_TOKEN=vittahub_2024

# VittaSys
VITTASYS_URL=https://vittasys.vittalissaude.com.br

# IA (Resumo automático)
ANTHROPIC_API_KEY=sk-ant-...

# Auth
JWT_SECRET=sua_chave_secreta_forte
PORT=3001
```

Sem as variáveis, o sistema funciona normalmente com dados mockados.

### Webhook URLs para Evolution API:
- POST `https://seu-vittahub.com/api/inbox/webhook/whatsapp`

### Webhook URLs para Instagram:
- POST/GET `https://seu-vittahub.com/api/inbox/webhook/instagram`

---

## 📁 Estrutura

```
vittahub/
├── backend/
│   ├── src/
│   │   ├── data/db.js          # banco em memória com dados de teste
│   │   ├── middleware/auth.js   # JWT guard
│   │   ├── routes/
│   │   │   ├── auth.js          # login, me, usuários
│   │   │   ├── leads.js         # CRUD leads + auto-assign
│   │   │   ├── inbox.js         # conversas, bot, VittaSys, webhooks
│   │   │   └── reports.js       # dashboard + PDF data
│   │   └── index.js             # servidor Express
│   └── uploads/                 # arquivos enviados no chat
│
└── frontend/
    ├── public/logos/            # logos com fundo transparente
    └── src/
        ├── context/AuthContext  # JWT + useApi hook
        ├── hooks/utils.js       # formatadores
        ├── components/          # Sidebar, LeadModal
        └── pages/               # Dashboard, Inbox, Leads, Funil, Relatorios, Config
```
