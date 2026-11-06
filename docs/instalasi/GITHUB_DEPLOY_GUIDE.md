# 🐙 Panduan Pembuatan SSH Deploy Key untuk GitHub (Live Chat Widget)

Menggunakan *SSH Deploy Key* adalah cara paling aman dan efisien untuk menarik (pull) kode dari repositori GitHub private Anda (Kiero Project Live Chat) langsung ke _Server Production_.

## Langkah 1: Generate SSH Key di Server
Masuk ke terminal server (via SSH `icon@10.14.151.119`) dan jalankan perintah berikut:

```bash
# Pindah ke direktori SSH (atau ini akan dibuat secara otomatis)
cd ~/.ssh

# Generate Ed25519 SSH Key baru (Lebih direkomendasikan & aman dari RSA)
ssh-keygen -t ed25519 -C "webchat"

# Ketika diminta "Enter file in which to save the key":
# KETIKKAN NAMA FILE:
/home/icon/.ssh/id_ed25519_webchat

# Ketika diminta "Enter passphrase (empty for no passphrase)":
# BIARKAN KOSONG (Tekan ENTER 2x) agar pull dapat berjalan otomatis tanpa interupsi.
```

## Langkah 1.5: Konfigurasi Host SSH Alias

Buat atau Edit file konfigurasi SSH:
```bash
nano ~/.ssh/config
```
Tambahkan blok ini ke dalamnya:
```text
Host github.com-webchat
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_webchat
  IdentitiesOnly yes
```
Simpan file (`Ctrl+O`, `Enter`, `Ctrl+X`).

## Langkah 2: Lihat dan Salin Public Key
Jalankan perintah ini untuk melihat isi dari _Public Key_ Anda:

```bash
cat ~/.ssh/id_ed25519_webchat.pub
```
Akan muncul respons berupa _string_ panjang (dimulai dengan `ssh-ed25519 ...`). 
**Blok dan salin (Copy)** seluruh _string_ tersebut.

## Langkah 3: Tambahkan ke GitHub Repository
1. Buka browser dan pergi ke halaman Private Repository Android/WebChat Anda di [GitHub.com](https://github.com/).
2. Masuk ke **Settings** repository.
3. Di *sidebar* sebelah kiri, klik menu **Deploy Keys** (berada di bawah kategori _Security_).
4. Klik tombol **Add deploy key** di kanan atas.
5. Pada *field*:
   - **Title**: Masukkan nama penanda, misalnya `Server Production 119`
   - **Key**: *Paste* (tempelkan) *public key* yang sudah Anda *copy* pada Langkah 2.
6. **PASTIKAN** *checkbox* **Allow write access** TIDAK DICENTANG (biarkan kosong). Kita hanya butuh akses untuk `git clone`/`git pull` (Read-only) demi keamanan.
7. Klik **Add key**.

## Langkah 4: Uji Koneksi SSH ke GitHub
Kembali ke terminal server, ketik:

```bash
ssh -T git@github.com-webchat
```

Jika GitHub meminta verifikasi *fingerprint*, ketik `yes` lalu tekan ENTER.
Anda harus mendapatkan respons seperti ini:
> *"Hi Kiero-Project/widget-live-chat! You've successfully authenticated..."*

## Langkah 5: Clone Project
Sekarang server Anda sudah diberikan izin oleh GitHub. Pindah ke folder server dan *clone* menggunakan **Host Alias** (`github.com-webchat`) yang telah dikonfigurasi.

```bash
# Kembali ke Home
cd ~

# Kloning repo WebChat (Gunakan github.com-webchat, bukan github.com)
git clone git@github.com-webchat:Kiero-Project/widget-live-chat.git webchat
```

Setiap kali Anda men-deploy pembaruan, Anda cukup SSH ke dalam server, masuk ke direktori aplikasi, lalu jalankan perintah penarikan:
```bash
cd /home/icon/webchat
git fetch --all
git reset --hard origin/main
# atau
git pull origin main
```
Tidak perlu transfer file manual dari server host lokal lagi.
