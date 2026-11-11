FROM python:3.12-slim

# ffmpeg for rendering, DejaVu font for text, Intel VAAPI driver (Bay Trail / Celeron N2930) for optional GPU encoding
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core i965-va-driver \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

ENV DATA_DIR=/data TZ=Europe/Berlin PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
