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

# Build de Next.js
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Usar next start (necesita el source completo para las plantillas .docx y .py)
CMD ["npm", "start"]
