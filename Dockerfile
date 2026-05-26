# ── Zonda Legal — Dockerfile ─────────────────────────────────────
# Compatible con Railway, Render, Fly.io, y cualquier VPS con Docker.
#
# Incluye:
#   - Node.js 20 (Next.js)
#   - Python 3 + reportlab + pypdf  (generación de PDFs)
#   - unzip + zip                   (procesamiento de plantillas DOCX)

FROM node:20-slim

# ── Sistema ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    unzip \
    zip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Paquetes Python ───────────────────────────────────────────────
RUN pip3 install --no-cache-dir --break-system-packages \
    reportlab \
    pypdf \
    Pillow

# ── App Node ──────────────────────────────────────────────────────
WORKDIR /app

# Instalar dependencias primero (mejor cache de capas)
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar código fuente completo
COPY . .

# Variables públicas de Next.js — deben estar disponibles en build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Build de Next.js
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Usar next start (necesita el source completo para las plantillas .docx y .py)
CMD ["npm", "start"]
