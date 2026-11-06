# 🚀 Deployment Guide — Live Chat Widget Platform

Panduan lengkap untuk deployment Live Chat Widget (Agent System + Client System) menggunakan Docker.
Mendukung dua mode: **Local Testing** dan **Production**.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Build & Deploy](#build--deploy)
- [Prisma Database Migration](#prisma-database-migration)
- [Updating & Redeployment](#updating--redeployment)
- [Monitoring & Logs](#monitoring--logs)
- [Backup & Restore](#backup--restore)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement          | Minimum Version | Check Command            |
|:---------------------|:----------------|:-------------------------|
| Docker               | 24.0+           | `docker --version`       |
| Docker Compose       | 2.20+           | `docker compose version` |

> **Note:** PostgreSQL dan Redis sudah termasuk di dalam Docker Compose (dikonfigurasi di `database/` dan `redis/`). Tidak perlu instalasi terpisah.

### Instalasi Docker & Docker Compose

Untuk panduan lengkap instalasi Docker dan Docker Compose di berbagai sistem operasi (Ubuntu, Debian, CentOS, RHEL), silakan merujuk ke panduan terpisah:

👉 **[Docker Installation Guide (DOCKER_INSTALLATION.md)](./DOCKER_INSTALLATION.md)**

Setelah Docker terinstal, pastikan user Anda sudah masuk ke grup `docker` agar bisa menjalankan perintah tanpa `sudo`.

---

## Architecture

Sistem menggunakan pola **Direct Host Proxy**. Hanya service aplikasi (Backend & Frontend) yang mengekspos port ke `127.0.0.1` host. Service infrastruktur (Redis & PostgreSQL) **tidak** memiliki port yang diekspos ke host — mereka hanya dapat diakses melalui jaringan internal Docker (`backend` network).

Frontend menggunakan **Runtime Environment Injection** (Build Once, Run Anywhere) — satu Docker Image yang sama bisa berjalan di lokal maupun production hanya dengan mengubah `.env`.

```
                    Internet (Port 80/443)
                        │
            ┌───────────┴───────────┐
            │ Nginx Global (Server) │  ← Hanya untuk Production
            └─┬──────┬──────┬──────┬┘
              │      │      │      │  proxy_pass ke 127.0.0.1
    ┌─────────┘      │      │      └─────────┐
    ▼                ▼      ▼                ▼
┌────────┐      ┌────────┐ ┌────────┐    ┌────────┐
│ Agent  │      │ Agent  │ │ Widget │    │ Widget │
│Frontend│      │Backend │ │Backend │    │Frontend│
│ :4172  │      │ :3003  │ │ :3002  │    │ :4171  │
│(nginx) │      │(node)  │ │(node)  │    │(nginx) │
└────────┘      └───┬────┘ └───┬────┘    └────────┘
                    │          │
    ════════════════╪══════════╪══════════════════
    Docker Internal │ Network  │ (tidak ada port host)
    ════════════════╪══════════╪══════════════════
              ┌─────┴──────────┴─────┐
              │     Redis :6379      │
              │   (Docker volume)    │
              └──────────┬───────────┘
              ┌──────────┴───────────┐
              │  PostgreSQL :5432    │
              │   (Docker volume)    │
              └──────────────────────┘
```

### Port Mapping (Host-Exposed)

| Service          | Host Port | Container Port | Description                                  |
|:-----------------|:----------|:---------------|:---------------------------------------------|
| agent-frontend   | 14172      | 4172           | Dashboard SPA (React + Vite via Nginx)       |
| agent-backend    | 13003      | 3003           | API Server (Fastify + Prisma + Socket.IO)    |
| widget-backend   | 13002      | 3002           | Widget API (Fastify + Socket.IO + BullMQ)    |
| widget-frontend  | 14171      | 4171           | Widget CDN (embed.js / embed.css via Nginx)  |

### Internal Only (Tidak ada port host)

| Service   | Container Port | Description                              |
|:----------|:---------------|:-----------------------------------------|
| redis     | 6379           | Shared Redis (BullMQ + Socket.IO)        |
| postgres  | 5432           | Shared PostgreSQL (Prisma)               |

---

## Quick Start

### 🧪 Local Testing

```bash
# 1. Clone repository
git clone <your-repo-url> widget-live-chat
cd widget-live-chat

# 2. Copy semua template environment
cp .env.example.local .env.local
cp agent-system/apps/backend/.env.example.local agent-system/apps/backend/.env.local
cp agent-system/apps/frontend/.env.example.local agent-system/apps/frontend/.env.local
cp client-system/packages/widget-backend/.env.example.local client-system/packages/widget-backend/.env.local
cp client-system/packages/widget-frontend/.env.example.local client-system/packages/widget-frontend/.env.local

# 3. Build & start all 6 services
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build

# 4. Run database migration (pertama kali)
docker compose --env-file .env.local -f docker-compose.local.yml exec agent-backend \
    npx prisma migrate deploy

# 5. (Opsional) Seed database
docker compose --env-file .env.local -f docker-compose.local.yml exec agent-backend \
    npx prisma db seed

# 6. Akses di browser
#    Agent Dashboard : http://localhost:4172
#    Widget CDN      : http://localhost:4171
#    Agent API       : http://localhost:3003
#    Widget API      : http://localhost:3002
```

### 🚀 Production

```bash
# -1. Konfigurasi Firewall (UFW) Server
# Pastikan port yang digunakan layanan WebChat terbuka dan dapat diakses publik.
# SANGAT PENTING: Buka port SSH agar Anda tidak terblokir (locked-out) dari server.
sudo ufw allow OpenSSH
# Buka standard HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Buka Port layanan WebChat
sudo ufw allow 4171/tcp
sudo ufw allow 4172/tcp
sudo ufw allow 3002/tcp
sudo ufw allow 3003/tcp
# Aktifkan Firewall
sudo ufw enable

# 0. Clone Project via GitHub
# Pastikan Anda telah mensetup SSH Deploy Key sesuai GITHUB_DEPLOY_GUIDE.md di repositori utama.
# Create Project Directories first
mkdir -p /home/icon/webchat/logs
cd /home/icon

git clone git@github.com-webchat:USERNAME/widget-live-chat.git webchat
cd webchat

# 1. Copy semua template environment
cp .env.example.production .env.production
cp agent-system/apps/backend/.env.example.production agent-system/apps/backend/.env.production
cp agent-system/apps/frontend/.env.example.production agent-system/apps/frontend/.env.production
cp client-system/packages/widget-backend/.env.example.production client-system/packages/widget-backend/.env.production
cp client-system/packages/widget-frontend/.env.example.production client-system/packages/widget-frontend/.env.production

# 2. Edit environment files (WAJIB — ganti semua placeholder!)
nano .env.production
nano agent-system/apps/backend/.env.production
# ... dll

# 3. Build & start all services
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 4. Run database migration (pertama kali)
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    npx prisma migrate deploy

# 5. (Opsional) Seed database
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    npx prisma db seed

# 6. Verify services
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

---

## Environment Configuration

### 1. Root `.env.local` / `.env.production` (Docker Compose Ports)
File root `ENV` benar-benar dikhususkan untuk orkestrasi Docker Ports dan infrastruktur Redis/Database semata. Tidak ada lagi kredensial logis aplikasi Node di sini.

| Variable               | Default  | Description                          |
|:-----------------------|:---------|:-------------------------------------|
| `REDIS_PASSWORD`       | required | Strong random password for Redis     |
| `POSTGRES_PASSWORD`    | required | Database system password             |
| `AGENT_BACKEND_PORT`   | `3003`   | Localhost port map untuk backend agent|
| `AGENT_FRONTEND_PORT`  | `4172`   | Localhost port map untuk FE agent    |
| `WIDGET_BACKEND_PORT`  | `3002`   | Localhost port map untuk DB widget   |
| `WIDGET_FRONTEND_PORT` | `4171`   | Localhost port map untuk FE widget   |

### 2. Agent Backend `.env.production`

| Variable              | Description                                    |
|:----------------------|:-----------------------------------------------|
| `DATABASE_URL`        | PostgreSQL connection string (external server)  |
| `REDIS_URL`           | `redis://:PASSWORD@redis:6379` (Docker network) |
| `JWT_SECRET`          | Strong random secret (min 64 chars)             |
| `WEBHOOK_SECRET`      | Shared secret with widget-backend               |
| `ENCRYPTION_KEY`      | Key for encrypting sensitive data               |
| `FRONTEND_URL`        | Production domain for CORS                      |
| `JWT_ACCESS_EXPIRY`   | Token expiry (e.g., `15m`)                      |
| `JWT_REFRESH_EXPIRY`  | Refresh token expiry (e.g., `7d`)               |

### 3. Frontend Runtime Configurations (`apps/frontend/.env.production`)
Berkat **Runtime Environment Substitutions**, Anda dapat meletakkan URL produksi tanpa takut terseret ke _Static Image_.
| Variable                  | Description                                    |
|:--------------------------|:-----------------------------------------------|
| `VITE_API_URL`            | e.g., `https://api.domain.com/api`             |
| `VITE_GOOGLE_MAPS_API_KEY`| Google maps public SDK key                     |

### 4. Widget Backend `.env.production`

| Variable                  | Description                                    |
|:--------------------------|:-----------------------------------------------|
| `REDIS_URL`               | `redis://:PASSWORD@redis:6379` (Docker network) |
| `WEBHOOK_SECRET`          | Must match agent-backend `WEBHOOK_SECRET`       |
| `AGENT_BACKEND_URL`       | `http://agent-backend:3003` (Docker internal)   |
| `AGENT_BACKEND_PUBLIC_URL`| Public URL for file attachments                 |

> **PENTING:** Service dalam docker mengakses service lain via hostname network docker (contoh: `redis`, `agent-backend`, `postgres`).

### Generate Strong Secrets

```bash
# Generate random 64-char secret
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Build & Deploy

### Build All Images

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

### Build Specific Service

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build agent-backend
```

### Start All Services

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

### Start Specific Service

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d agent-backend
```

### Stop All Services

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

### Stop & Remove Volumes (⚠️ DESTRUCTIVE)

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down -v
```

---

## Prisma Database Migration

### First Deployment

```bash
# Apply all pending migrations
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    npx prisma migrate deploy
```

### After Schema Changes

```bash
# 1. Rebuild agent-backend (re-generates Prisma client)
docker compose --env-file .env.production -f docker-compose.prod.yml build agent-backend

# 2. Apply migrations
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    npx prisma migrate deploy

# 3. Restart
docker compose --env-file .env.production -f docker-compose.prod.yml up -d agent-backend
```

### Seed Database

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    npx prisma db seed
```

---

## Updating & Redeployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild & restart (zero-downtime for stateless services)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 3. Apply database migrations (if any)
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    npx prisma migrate deploy

# 4. Clean up old images
docker image prune -f
```

---

## Monitoring & Logs

### Service Status

```bash
# All services with health status
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# Resource usage
docker stats --no-stream
```

### View Logs

```bash
# All services
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f

# Specific service (last 100 lines)
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=100 agent-backend

# Search logs
docker compose --env-file .env.production -f docker-compose.prod.yml logs agent-backend 2>&1 | grep "ERROR"
```

### Health Checks

```bash
# Agent Backend
curl http://localhost:3003/health

# Agent Backend (readiness — checks DB + Redis)
curl http://localhost:3003/health/ready

# Agent Backend (metrics)
curl http://localhost:3003/health/metrics

# Widget Backend
curl http://localhost:3002/health

# Widget Backend (readiness — checks Redis)
curl http://localhost:3002/health/ready

# Widget Backend (metrics)
curl http://localhost:3002/health/metrics

# Redis
docker compose --env-file .env.production -f docker-compose.prod.yml exec redis redis-cli -a YOUR_PASSWORD ping
```

---

## Backup & Restore

### Redis Backup

```bash
# Trigger RDB snapshot
docker compose --env-file .env.production -f docker-compose.prod.yml exec redis redis-cli -a YOUR_PASSWORD BGSAVE

# Copy backup file from volume
docker cp webchat-redis:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb
```

### Redis Restore

```bash
# Stop Redis
docker compose --env-file .env.production -f docker-compose.prod.yml stop redis

# Copy backup into volume
docker cp ./backups/redis-backup.rdb webchat-redis:/data/dump.rdb

# Start Redis
docker compose --env-file .env.production -f docker-compose.prod.yml start redis
```

### Uploads Backup

```bash
# Backup uploads volume
docker run --rm -v widget-live-chat_agent_uploads:/data -v $(pwd)/backups:/backup \
    alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

### Uploads Restore

```bash
docker run --rm -v widget-live-chat_agent_uploads:/data -v $(pwd)/backups:/backup \
    alpine sh -c "rm -rf /data/* && tar xzf /backup/uploads-backup.tar.gz -C /data"
```

---

## Reverse Proxy Setup (Production Ingress)

Sistem menggunakan pola **Direct Host Proxy**. Nginx di Host Server (Ubuntu) melakukan *SSL Termination* dan meneruskan traffic ke port kontainer yang di-bind ke `127.0.0.1`.

### 🛠️ Nginx Installation & Hardening

Untuk panduan lengkap instalasi Nginx dengan standar industri (Brotli, Security Hardening, Optimasi), silakan merujuk ke panduan terpisah:

👉 **[Nginx Installation Guide (NGINX_INSTALLATION.md)](./NGINX_INSTALLATION.md)**

### 📝 Langkah 1: Buat Vhost HTTP-Only (Untuk Generate SSL)

Pertama, buat konfigurasi HTTP-only agar Certbot bisa memvalidasi domain. Buat file `/etc/nginx/sites-available/webchat.conf`:

```nginx
# ── Temporary HTTP-only config (untuk Certbot) ─────────────────────
server {
    listen 80;
    server_name agent.domain.com api.domain.com widget.domain.com widgetapi.domain.com;

    location / {
        return 200 'Certbot validation...';
        add_header Content-Type text/plain;
    }
}
```

```bash
# Aktifkan config
sudo ln -s /etc/nginx/sites-available/webchat.conf /etc/nginx/sites-enabled/

# Hapus default agar tidak menabrak port 80
sudo rm -f /etc/nginx/sites-enabled/default

# Test & reload
sudo nginx -t && sudo systemctl reload nginx

# Generate SSL via Certbot
sudo certbot --nginx -d agent.domain.com -d api.domain.com -d widget.domain.com -d widgetapi.domain.com
```

> [!IMPORTANT]
> Pastikan DNS untuk keempat domain sudah mengarah ke IP server Anda sebelum menjalankan Certbot.

### 📝 Langkah 2: Ganti Dengan Konfigurasi Production

Setelah sertifikat SSL berhasil dibuat, **ganti isi** `/etc/nginx/sites-available/webchat.conf` dengan konfigurasi production berikut:

```nginx
# =============================================================================
# /etc/nginx/sites-available/webchat.conf
# Live Chat Platform — Production Reverse Proxy
# =============================================================================

# ── Redirect semua HTTP → HTTPS ────────────────────────────────────
server {
    listen 80;
    server_name agent.domain.com api.domain.com widget.domain.com widgetapi.domain.com;
    return 301 https://$host$request_uri;
}

# ── 1. Agent Frontend (Dashboard SPA) ──────────────────────────────
server {
    listen 443 ssl http2;
    server_name agent.domain.com;

    ssl_certificate     /etc/letsencrypt/live/agent.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agent.domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4172;
        include proxy_params;
    }
}

# ── 2. Agent Backend API (REST + Socket.IO) ────────────────────────
server {
    listen 443 ssl http2;
    server_name api.domain.com;

    ssl_certificate     /etc/letsencrypt/live/api.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3003;
        include proxy_params;

        # WebSocket Support (Socket.IO)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}

# ── 3. Widget Frontend (CDN / Embeddable Assets) ───────────────────
server {
    listen 443 ssl http2;
    server_name widget.domain.com;

    ssl_certificate     /etc/letsencrypt/live/widget.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/widget.domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4171;
        include proxy_params;
    }
}

# ── 4. Widget Backend API (Visitor WebSocket Gateway) ──────────────
server {
    listen 443 ssl http2;
    server_name widgetapi.domain.com;

    ssl_certificate     /etc/letsencrypt/live/widgetapi.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/widgetapi.domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3002;
        include proxy_params;

        # WebSocket Support (Socket.IO)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

```bash
# Test & reload konfigurasi baru
sudo nginx -t && sudo systemctl reload nginx
```

> [!NOTE]
> **CORS**: Widget Frontend container (`nginx.conf`) sudah mengatur header CORS secara internal. Tidak perlu menambahkan header CORS di level Nginx Global karena bisa menyebabkan *duplicate header*.
>
> **Compression**: Gzip/Brotli sudah dikonfigurasi di level `http {}` block (lihat NGINX_INSTALLATION.md). Container Nginx juga memiliki gzip sendiri. Nginx cukup pintar untuk tidak melakukan *double compression*.
>
> **Redis & PostgreSQL**: Port 6379 dan 5432 **tidak** diekspos ke host. Mereka sepenuhnya terisolasi di jaringan Docker internal.

---

### 🌐 Alternatif: IP-Only Deployment (Tanpa Domain)

Jika server Anda hanya memiliki IP publik (contoh: `10.14.151.119`) tanpa domain, gunakan panduan ini.

#### Mode A: Tanpa SSL (HTTP Direct)

Mode paling sederhana. **Tidak perlu Nginx Global.** Container langsung melayani traffic.

**Langkah 1:** Edit `docker-compose.prod.yml` — hapus `127.0.0.1:` dari semua port binding agar container bisa diakses dari luar:

```diff
# agent-backend
- "127.0.0.1:${AGENT_BACKEND_PORT:-13003}:3003"
+ "${AGENT_BACKEND_PORT:-3003}:3003"

# agent-frontend
- "127.0.0.1:${AGENT_FRONTEND_PORT:-14172}:4172"
+ "${AGENT_FRONTEND_PORT:-4172}:4172"

# widget-backend
- "127.0.0.1:${WIDGET_BACKEND_PORT:-13002}:3002"
+ "${WIDGET_BACKEND_PORT:-3002}:3002"

# widget-frontend
- "127.0.0.1:${WIDGET_FRONTEND_PORT:-14171}:4171"
+ "${WIDGET_FRONTEND_PORT:-4171}:4171"
```

**Langkah 2:** Start services:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

**Langkah 3:** Akses via browser:

| Service          | URL                             |
|:-----------------|:--------------------------------|
| Agent Dashboard  | `http://10.14.151.119:4172`     |
| Agent API        | `http://10.14.151.119:3003`     |
| Widget CDN       | `http://10.14.151.119:4171`     |
| Widget API       | `http://10.14.151.119:3002`     |

> [!WARNING]
> Mode ini **tidak terenkripsi**. Hanya gunakan untuk server internal/staging/testing. Jangan gunakan untuk production publik.

---

#### Mode B: Dengan Self-Signed SSL (HTTPS)

Untuk server yang membutuhkan enkripsi tanpa domain. Menggunakan Nginx Global dengan sertifikat self-signed.

**Langkah 1:** Generate & Copy SSL Certs (Satu Kali):
Penyebaran ini menyediakan script utilitas agar sama persis seperti platform Geomap.
```bash
chmod +x generate_ssl.sh renew_ssl.sh
./generate_ssl.sh

# Copy ke direktori Host Nginx
sudo cp keys/ssl/nginx.crt /etc/ssl/certs/webchat-selfsigned.crt
sudo cp keys/ssl/nginx.key /etc/ssl/private/webchat-selfsigned.key
```

**Langkah 2:** Offset container host ports agar tidak bentrok dengan Nginx.

Edit `.env.production`:
```ini
# Port binding internal (Nginx akan mengambil port publik)
AGENT_FRONTEND_PORT=14172
AGENT_BACKEND_PORT=13003
WIDGET_FRONTEND_PORT=14171
WIDGET_BACKEND_PORT=13002
```

> Container tetap bind ke `127.0.0.1:1xxxx`, Nginx mendengarkan di port publik (`4172`, `3003`, `4171`, `3002`) dengan SSL.

**Langkah 3:** Buat Nginx config `/etc/nginx/sites-available/webchat-ip.conf`:

```nginx
# =============================================================================
# /etc/nginx/sites-available/webchat-ip.conf
# IP-Only Deployment with Self-Signed SSL
# =============================================================================

# ── 1. Agent Frontend (Dashboard) — Port 4172 ─────────────────────
server {
    listen 4172 ssl http2;
    server_name _;

    ssl_certificate     /etc/ssl/certs/webchat-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/webchat-selfsigned.key;

    location / {
        proxy_pass http://127.0.0.1:14172;
        include proxy_params;
    }
}

# ── 2. Agent Backend API (REST + WebSocket) — Port 3003 ────────────
server {
    listen 3003 ssl http2;
    server_name _;

    ssl_certificate     /etc/ssl/certs/webchat-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/webchat-selfsigned.key;

    location / {
        proxy_pass http://127.0.0.1:13003;
        include proxy_params;

        # WebSocket Support (Socket.IO)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}

# ── 3. Widget Frontend (CDN / Assets) — Port 4171 ─────────────────
server {
    listen 4171 ssl http2;
    server_name _;

    ssl_certificate     /etc/ssl/certs/webchat-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/webchat-selfsigned.key;

    location / {
        proxy_pass http://127.0.0.1:14171;
        include proxy_params;
    }
}

# ── 4. Widget Backend API (Visitor WebSocket) — Port 3002 ──────────
server {
    listen 3002 ssl http2;
    server_name _;

    ssl_certificate     /etc/ssl/certs/webchat-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/webchat-selfsigned.key;

    location / {
        proxy_pass http://127.0.0.1:13002;
        include proxy_params;

        # WebSocket Support (Socket.IO)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

**Langkah 4:** Aktifkan dan start:
```bash
# Aktifkan config
sudo ln -s /etc/nginx/sites-available/webchat-ip.conf /etc/nginx/sites-enabled/

# Hapus default
sudo rm -f /etc/nginx/sites-enabled/default

# Test & reload
sudo nginx -t && sudo systemctl reload nginx

# Start Docker containers
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

**Langkah 5:** Akses via browser (accept self-signed cert warning):

| Service          | URL                              |
|:-----------------|:---------------------------------|
| Agent Dashboard  | `https://10.14.151.119:4172`     |
| Agent API        | `https://10.14.151.119:3003`     |
| Widget CDN       | `https://10.14.151.119:4171`     |
| Widget API       | `https://10.14.151.119:3002`     |

> [!NOTE]
> Browser akan menampilkan warning "Your connection is not private" untuk self-signed certificate. Ini normal — klik **Advanced → Proceed** untuk melanjutkan.

**Langkah 6:** Auto-Renewal (Maintenance)
Sertifikat valid untuk 10 tahun, "renewal" jarang diperlukan. Namun untuk mencegah *downtime* atau memperpendek durasi validasi, Anda bisa menggunakan skrip pembaharuan ini:

**Cek Manual**:
```bash
./renew_ssl.sh
# Mengecek kedaluwarsa (< 30 hari). Jika segara membusuk, maka skrip akan men-generate ulang,
# menyalinnya ke /etc/ssl/, lalu me-reload Nginx Global secara otomatis.
```

**Perpanjangan Otomatis via Cron (Opsional)**:
Pastikan folder `logs` terbentuk agar output tidak gagal diarahkan:
```bash
mkdir -p /home/icon/webchat/logs
crontab -e
# Tambahkan baris ini di config cron:
0 0 1 * * /home/icon/webchat/renew_ssl.sh >> /home/icon/webchat/logs/ssl_renew.log 2>&1
```

---

#### Ringkasan: Kapan Pakai Mode Apa?

| Skenario | Mode | SSL | Nginx Global |
|:---------|:-----|:----|:-------------|
| Development lokal | Mode A | ❌ | ❌ |
| Server internal / VPN | Mode A | ❌ | ❌ |
| Staging server (perlu enkripsi) | Mode B | ✅ Self-signed | ✅ |
| Production dengan domain | Domain-based (Langkah 1 & 2 di atas) | ✅ Let's Encrypt | ✅ |

---

## Troubleshooting

### Container Gagal Start

```bash
# Periksa logs container yang gagal
docker compose --env-file .env.production -f docker-compose.prod.yml logs agent-backend

# Periksa health check status
docker inspect --format='{{json .State.Health}}' agent-backend | jq
```

### Redis Connection Refused

Cek apakah password cocok di semua env files:
- `.env.local` / `.env.production` → `REDIS_PASSWORD`
- `agent-system/apps/backend/.env.*` → `REDIS_URL` password
- `client-system/packages/widget-backend/.env.*` → `REDIS_URL` password

```bash
# Test Redis connection dari dalam container
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    sh -c "wget -qO- http://localhost:3003/health/ready"
```

### Database Connection Error

```bash
# Test koneksi PostgreSQL dari agent-backend container
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend \
    npx prisma db execute --stdin <<< "SELECT 1"
```

### Permission Denied on Uploads

```bash
# Periksa ownership volume
docker compose --env-file .env.production -f docker-compose.prod.yml exec agent-backend ls -la /app/apps/uploads

# Fix permissions (jika perlu)
docker compose --env-file .env.production -f docker-compose.prod.yml exec -u root agent-backend \
    chown -R 1001:1001 /app/apps/uploads
```

### Rebuild Dari Awal (Clean Build)

```bash
# Remove containers + rebuild tanpa cache
docker compose --env-file .env.production -f docker-compose.prod.yml down
docker compose --env-file .env.production -f docker-compose.prod.yml build --no-cache
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

---

## File Structure

```
widget-live-chat/
├── .env.example.local                        # Root infra env (ports, passwords) — local
├── .env.example.production                   # Root infra env (ports, passwords) — prod
├── DOCKER_INSTALLATION.md                    # Panduan instalasi Docker (Host)
├── NGINX_INSTALLATION.md                     # Panduan instalasi Nginx & Optimasi (Host)
├── docker-compose.local.yml                  # Local compose (6 services: PG + Redis + 4 apps)
├── docker-compose.prod.yml                   # Prod compose (6 services: PG + Redis + 4 apps)
│
├── database/
│   └── docker-compose.yml                    # PostgreSQL (internal only, no host port)
│
├── redis/
│   ├── docker-compose.yml                    # Redis (internal only, no host port)
│   └── redis.conf                            # Redis production config
│
├── agent-system/
│   ├── .dockerignore
│   ├── docker/
│   │   ├── agent-backend.Dockerfile          # Backend multi-stage build
│   │   ├── agent-frontend.Dockerfile         # Frontend SPA → Nginx + runtime envs
│   │   ├── 40-inject-envs.sh                 # Runtime env substitution script
│   │   └── nginx-agent.conf                  # Nginx config (listen :4172)
│   └── apps/
│       ├── backend/
│       │   ├── .env.example.local            # Backend env for Docker local
│       │   └── .env.example.production       # Backend env for Docker prod
│       └── frontend/
│           ├── .env.example.local            # Frontend env for Docker local
│           └── .env.example.production       # Frontend env for Docker prod
│
├── client-system/
│   ├── .dockerignore
│   ├── docker/
│   │   ├── backend.Dockerfile                # Widget backend build
│   │   ├── frontend.Dockerfile               # Widget IIFE → Nginx + runtime envs
│   │   ├── 40-inject-envs.sh                 # Runtime env substitution script
│   │   └── nginx.conf                        # Nginx config (listen :4171)
│   └── packages/
│       ├── widget-backend/
│       │   ├── .env.example.local            # Widget backend env for Docker local
│       │   └── .env.example.production       # Widget backend env for Docker prod
│       └── widget-frontend/
│           ├── .env.example.local            # Widget frontend env for Docker local
│           └── .env.example.production       # Widget frontend env for Docker prod
```
