# 🌐 Nginx Global Installation & Optimization Guide

Panduan ini menjelaskan cara menginstal dan mengoptimalkan Nginx di Host OS (Ubuntu Server) sebagai Reverse Proxy untuk platform Live Chat. Mencakup Security Hardening, Gzip, Brotli, dan SSL via Certbot.

---

## 📥 1. Instalasi Nginx

Menggunakan paket bawaan Ubuntu yang sudah menyertakan struktur `sites-available/sites-enabled` dan file `proxy_params` secara default.

```bash
# 1. Update system packages
sudo apt update && sudo apt upgrade -y

# 2. Install Nginx
sudo apt install -y nginx

# 3. Enable & Start
sudo systemctl enable nginx
sudo systemctl start nginx

# 4. Verify
nginx -v
sudo systemctl status nginx
```

> [!NOTE]
> Paket `nginx` dari repository Ubuntu sudah menyertakan:
> - `/etc/nginx/sites-available/` & `/etc/nginx/sites-enabled/` (vhost management)
> - `/etc/nginx/proxy_params` (header proxy standar)
> - Integrasi systemd yang stabil

---

## 🧬 2. Brotli Compression (Opsional, Recommended)

Brotli memberikan kompresi ~20-26% lebih baik dibanding Gzip untuk aset statis (JS/CSS).

```bash
# Install modul Brotli (tersedia di Ubuntu 22.04+)
sudo apt install -y libnginx-mod-brotli

# Verifikasi modul ter-load
nginx -V 2>&1 | grep brotli
```

> [!TIP]
> Jika `libnginx-mod-brotli` tidak tersedia di versi Ubuntu Anda, Anda bisa melewati langkah ini. Gzip sudah cukup untuk sebagian besar deployment.

---

## 🔒 3. Instalasi Certbot (SSL/TLS)

```bash
# Install Certbot + Nginx plugin
sudo apt install -y certbot python3-certbot-nginx
```

---

## 🛡️ 4. Security Hardening & Optimasi Global

Edit file `/etc/nginx/nginx.conf` untuk meningkatkan keamanan dan performa.

### 4a. Optimasi Worker

Tambahkan/update di bagian paling atas file:

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}
```

### 4b. Pengerasan Keamanan & Compression

Tambahkan/update di dalam blok `http { ... }`:

```nginx
http {
    # ── Sembunyikan versi Nginx ────────────────────────────
    server_tokens off;

    # ── MIME & Charset ─────────────────────────────────────
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    charset       utf-8;

    # ── Optimasi Buffer ────────────────────────────────────
    client_body_buffer_size    16K;
    client_header_buffer_size  1k;
    client_max_body_size       50M;
    large_client_header_buffers 4 8k;

    # ── Timeouts ───────────────────────────────────────────
    client_body_timeout   12;
    client_header_timeout 12;
    keepalive_timeout     65;
    send_timeout          10;

    # ── SSL Hardening (Mozilla Intermediate) ───────────────
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # DH Parameters (Opsional tapi disarankan)
    # Jalankan: sudo openssl dhparam -out /etc/nginx/dhparam.pem 2048
    # ssl_dhparam /etc/nginx/dhparam.pem;

    # ── Gzip Compression ──────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        image/svg+xml
        font/woff2;

    # ── Brotli Compression (jika modul terinstal) ─────────
    # Hapus komentar jika brotli terinstal (Langkah 2)
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types
    #     text/plain
    #     text/css
    #     text/xml
    #     text/javascript
    #     application/json
    #     application/javascript
    #     application/xml
    #     image/svg+xml
    #     font/woff2;

    # ── Logging ────────────────────────────────────────────
    access_log /var/log/nginx/access.log;
    error_log  /var/log/nginx/error.log;

    # ── Includes ───────────────────────────────────────────
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

---

## 🛠️ 5. Konfigurasi `proxy_params`

File `/etc/nginx/proxy_params` sudah ada secara default dari paket Ubuntu. Verifikasi isinya dan update jika perlu:

```bash
cat /etc/nginx/proxy_params
```

Isi yang direkomendasikan:

```nginx
proxy_set_header Host              $http_host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Port  $server_port;
```

---

## 🚀 6. Firewall (UFW)

```bash
# Buka port HTTP dan HTTPS
sudo ufw allow 'Nginx Full'

# Verifikasi
sudo ufw status
```

---

## 🚦 7. Verifikasi & Management

```bash
# Cek sintaks konfigurasi
sudo nginx -t

# Reload (Zero downtime)
sudo systemctl reload nginx

# Restart (Full restart)
sudo systemctl restart nginx

# Cek error logs
sudo tail -f /var/log/nginx/error.log
```

---

## 🛠️ Troubleshooting

### 1. `nginx -t` Gagal Setelah Edit Config
```bash
# Cek error detail
sudo nginx -t 2>&1

# Restore ke default jika perlu
sudo cp /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf
```

### 2. Port 80 Sudah Dipakai
```bash
# Cek proses yang menggunakan port 80
sudo lsof -i :80

# Kill proses jika perlu (misal Apache)
sudo systemctl stop apache2 && sudo systemctl disable apache2
```

### 3. Brotli Module Not Found
```bash
# Cek apakah modul ter-load
nginx -V 2>&1 | grep -i brotli

# Jika tidak, pastikan paket terinstal
sudo apt install -y libnginx-mod-brotli
sudo systemctl restart nginx
```

---

> [!IMPORTANT]
> Sebelum mengedit `/etc/nginx/nginx.conf`, selalu buat backup:
> `sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak`
