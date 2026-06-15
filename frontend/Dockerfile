# ─── VittaHub Frontend — build via Docker ─────────────────────────────────────
# Por que Docker em vez do Railpack: o Railpack remontava o ambiente base toda
# vez (apt libatomic1 + mise + npm), passo que às vezes travava por 20 min num
# builder ruim. Com Docker, a instalação de dependências vira uma CAMADA CACHEADA
# (só reinstala quando package*.json muda) e o passo lento do apt some.
FROM node:22-alpine

WORKDIR /app

# 1) Camada de dependências — cacheada enquanto package*.json não mudar
COPY package*.json ./
RUN npm ci

# 2) Código + build de produção (lê .env.production → VITE_API_URL)
COPY . .
RUN npm run build

# 3) Serve o dist/ com vite preview, na porta que o Railway injeta ($PORT).
#    allowedHosts e host 0.0.0.0 já vêm do vite.config.js / script start.
EXPOSE 3000
CMD ["npm", "run", "start"]
