FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY docker ./docker
COPY README.md ./README.md

RUN npm run prisma:generate
RUN npm run build

EXPOSE 4000

CMD ["sh", "./docker/start.sh"]
