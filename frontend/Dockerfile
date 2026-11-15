# --- Build: React-App mit Vite bauen ---
FROM docker.io/library/node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- Laufzeit: nginx liefert die fertigen Dateien aus und reicht /api weiter ---
FROM docker.io/library/nginx:stable-alpine

# Lässt das Image beim Start den DNS-Server des Container-Netzes in die Vorlage eintragen.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
