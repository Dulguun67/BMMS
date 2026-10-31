# БММС API — production image
# Сайжруулалт: base image-ийг digest-ээр (@sha256:...) түгжиж, ECR-д Qualys/Inspector-оор скан хийнэ.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# AWS RDS-ийн CA bundle (DB_SSL_CA=/app/certs/rds-global-bundle.pem)
ADD --chown=node:node https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
# Migration (нэг удаагийн ECS task: node scripts/migrate.js). Demo seed production image-д орохгүй.
COPY --chown=node:node db/migrations ./db/migrations
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "src/server.js"]
