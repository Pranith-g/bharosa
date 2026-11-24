# 1) build the web app
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build --outDir /web/dist

# 2) the server
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bharosa ./bharosa
COPY --from=web /web/dist ./bharosa/web/dist
RUN useradd -m bharosa && chown -R bharosa /app
USER bharosa
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["python", "-m", "bharosa.cli", "serve", "--host", "0.0.0.0", "--port", "8000"]
