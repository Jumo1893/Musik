# --- Build: TypeScript nach JavaScript übersetzen ---
FROM docker.io/library/node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- Laufzeit: nur das Übersetzte und die Laufzeit-Abhängigkeiten ---
FROM docker.io/library/node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY migrations ./migrations
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
