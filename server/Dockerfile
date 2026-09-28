# Watten Power API (Express). Connects to MongoDB via MONGODB_URI -- the
# database is not in this image. See docker-compose.yml at the repo root.
FROM node:20-alpine

WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Don't run as root.
USER node

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "src/index.js"]
