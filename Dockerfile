# syntax=docker/dockerfile:1
# Imagen única de Servistock: el backend (Express) sirve también la aplicación Angular compilada.
# Un solo servicio = despliegue simple (Docker, Railway, etc.), sin CORS ni proxies adicionales.

# ---- 1) Frontend: compila la PWA Angular ------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build

# ---- 2) Backend: compila TypeScript a JavaScript ----------------------------------------------
FROM node:22-alpine AS backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/src ./src
RUN npm run build

# ---- 3) Imagen final: solo lo necesario para ejecutar ------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    FRONTEND_DIR=/app/public
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist/frontend/browser ./public

# El proceso no corre como root
USER node
EXPOSE 3000

# El health check también verifica la conexión a la base de datos
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/salud" || exit 1

CMD ["node", "dist/server.js"]
