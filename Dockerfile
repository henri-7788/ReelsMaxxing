# ---- Stage 1: build the web UI (Next.js static export) ---------------------
# Node is only needed here. The final image has no Node.js process, so the
# Celeron N2930 only serves a few static files at runtime.
FROM node:22-slim AS web
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- Stage 2: runtime ------------------------------------------------------
FROM python:3.12-slim

# ffmpeg for rendering, DejaVu font for text, Intel VAAPI driver (Bay Trail / Celeron N2930) for optional GPU encoding
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core i965-va-driver \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY --from=web /web/out ./app/web

ENV DATA_DIR=/data TZ=Europe/Berlin PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
