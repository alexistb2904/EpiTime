
FROM node:20-alpine AS client-builder

WORKDIR /client

ENV NODE_ENV=development \
    VITE_API_BASE=/api

COPY client/package*.json ./
COPY client/vite.config.js ./
COPY client/index.html ./

RUN npm install

COPY client/src ./src
COPY client/public ./public

RUN npm run build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    ZEUS_BASE=https://zeus.ionis-it.com \
    ALLOWED_ORIGIN=http://localhost:3001 \
    VAPID_PUBLIC_KEY=""

COPY server/package*.json ./

RUN npm install --production

COPY server/server.js .

COPY --from=client-builder /client/dist ./public

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=5s \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "server.js"]
