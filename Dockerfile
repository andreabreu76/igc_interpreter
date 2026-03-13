FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads

EXPOSE 8080

ENV PORT=8080

CMD ["node", "server.js"]
