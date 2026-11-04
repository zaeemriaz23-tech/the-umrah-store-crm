FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache git && npm install --omit=dev && apk del git
COPY . .
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node","server.js"]
