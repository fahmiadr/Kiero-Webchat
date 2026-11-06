# 🐳 Docker & Docker Compose Installation Guide

Panduan lengkap untuk instalasi Docker Engine dan Docker Compose di berbagai distribusi Linux. Panduan ini dioptimalkan untuk performa dan keamanan.

## 🐧 Ubuntu / Debian (Recommended)

Metode ini menggunakan repository resmi Docker untuk memastikan Anda mendapatkan versi terbaru dan update keamanan.

```bash
# 1. Update system packages
sudo apt update && sudo apt upgrade -y

# 2. Install dependencies
sudo apt install -y ca-certificates curl gnupg lsb-release

# 3. Add Docker official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 4. Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. Install Docker Engine + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 6. Post-installation steps (Manage Docker as a non-root user)
# Ganti 'icon' dengan username Anda jika berbeda
sudo usermod -aG docker $USER
# (PENTING: Anda harus logout dan login kembali agar perubahan ini berlaku)
# Atau jalankan perintah ini untuk sesi saat ini:
newgrp docker

# 7. Enable Docker on boot
sudo systemctl enable docker
sudo systemctl start docker

# 8. Verify installation
docker --version
docker compose version
```

---

## 🐂 CentOS / RHEL / Rocky Linux

```bash
# 1. Remove old versions (if any)
sudo yum remove -y docker docker-client docker-common docker-latest docker-engine

# 2. Install dependencies
sudo yum install -y yum-utils

# 3. Add Docker repository
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 4. Install Docker Engine + Compose plugin
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Post-installation steps
sudo usermod -aG docker $USER
newgrp docker

# 6. Enable Docker on boot
sudo systemctl enable docker
sudo systemctl start docker

# 7. Verify installation
docker --version
docker compose version
```

---

## 🛠️ Troubleshooting

### 1. DNS Resolution Failure
**Issue**: `Temporary failure in name resolution` saat menjalankan `apt-get update` atau `docker pull`.
**Cause**: Konfigurasi DNS server tidak stabil atau memblokir domain eksternal.
**Fix**:
- Tambahkan Google DNS ke `/etc/resolv.conf`:
  ```bash
  echo "nameserver 8.8.8.8" | sudo tee -a /etc/resolv.conf
  ```
- Update `/etc/systemd/resolved.conf` dengan `DNS=8.8.8.8`.
- Restart service: 
  ```bash
  sudo systemctl restart systemd-resolved
  ```

### 2. Docker Permission Denied
**Issue**: `permission denied while trying to connect to the Docker daemon socket`.
**Cause**: User Anda (misal: `icon`) belum terdaftar di grup `docker`.
**Fix**:
- Jalankan perintah: `sudo usermod -aG docker $USER` (atau ganti `$USER` dengan `icon`).
- **PENTING**: Anda **WAJIB** logout dan login kembali agar perubahan grup ini berlaku. Seringkali reboot diperlukan jika `newgrp` tidak membantu.

### 3. Docker Service Not Starting
Periksa status service dengan:
```bash
sudo systemctl status docker
```
Jika error, coba restart:
```bash
sudo systemctl restart docker
```

---

> [!TIP]
> Selalu gunakan Docker Compose V2 (perintah `docker compose`, bukan `docker-compose`) untuk fitur terbaru dan performa yang lebih baik.
