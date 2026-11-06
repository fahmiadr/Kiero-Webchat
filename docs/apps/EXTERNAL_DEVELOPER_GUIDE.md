# Panduan Integrasi Webhook (Untuk Developer Eksternal)

Dokumen ini berisi spesifikasi teknis untuk mengirimkan pesan dari sistem eksternal (Aplikasi Anda) ke **Agent System Kami**.

## 1. Konfigurasi Endpoint

Sistem Anda harus mengirimkan request HTTP POST ke endpoint berikut:

*   **URL**: `https://[DOMAIN_KAMI]/api/webhook/inbound`
*   **Method**: `POST`
*   **Content-Type**: `application/json`

## 2. Otentikasi & Keamanan

Setiap request **WAJIB** menyertakan header keamanan berikut yang akan kami berikan kepada Anda:

| Header | Deskripsi |
| :--- | :--- |
| `Authorization` | Token akses dengan format `Bearer [ACCESS_TOKEN]`. |
| `X-Hub-Signature` | Signature HMAC-SHA256 dari body request untuk verifikasi integritas data. |

### Cara Membuat Signature (X-Hub-Signature)
1.  Ambil **RAW BODY** dari request JSON (sebagai string).
2.  Gunakan **Secret Key** yang kami berikan.
3.  Buat hash **HMAC-SHA256** dari raw body tersebut.
4.  Format header: `sha256=[hash_hex]`.

**Contoh Code (Node.js):**
```javascript
const crypto = require('crypto');

const secret = 'whsec_YOUR_SECRET_KEY';
const payload = JSON.stringify(data); // Pastikan ini string yang sama persis dengan yang dikirim

const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

// Header: 'X-Hub-Signature': `sha256=${signature}`
```

## 3. Format Request (JSON)

Kirimkan JSON dengan struktur berikut untuk mengirim pesan baru.

### Event: `message.created`

```json
{
  "event": "message.created",
  "id": "evt_unique_id_123",        // ID unik untuk event ini (untuk log)
  "timestamp": "2024-03-20T10:00:00Z",
  "data": {
    "conversation_id": "chat_session_001", // ID unik percakapan/tiket di sistem Anda
    "message_id": "msg_001",               // ID unik pesan (untuk mencegah duplikasi)
    "sender": {
      "id": "user_id_999",                 // ID User/Customer di sistem Anda
      "name": "Budi Santoso",              // Nama User yang akan tampil di Agent
      "role": "visitor"                    // Selalu "visitor"
    },
    "content": "Halo, saya ingin bertanya tentang tagihan.",
    "type": "text",                        // "text", "image", atau "document"
    "attachments": []                      // Opsional, lihat detail di bawah
  }
}
```

### Format Attachment (Opsional)
Jika pesan berisi file/gambar, isi array `attachments`:
```json
"attachments": [
  {
    "name": "bukti_transfer.jpg",
    "type": "image/jpeg",
    "url": "https://cdn.example.com/file/bukti_transfer.jpg", // URL publik yang bisa diakses server kami
    "size": 102400 // Ukuran dalam bytes (opsional)
  }
]
```

## 4. Response

Server kami akan merespon dengan kode HTTP standar:

*   **200 OK**: Pesan berhasil diterima dan antrikan.
*   **401 Unauthorized**: Token salah atau Signature tidak valid.
*   **400 Bad Request**: Format JSON salah.
*   **500 Internal Server Error**: Kesalahan sisi server (harap coba lagi/retry).

### Kebijakan Retry
Jika Anda menerima respon **5xx** atau timeout, mohon lakukan mekanisme **Retry** (pengiriman ulang) secara berkala (misal: setiap 5 detik) hingga berhasil (200 OK). Kami menggunakan `message_id` untuk memastikan pesan tidak terduplikasi jika dikirim ulang.

## 5. Menerima Balasan Agent (Outbound Webhook)

Untuk menerima balasan dari Agent kami, sistem Anda harus menyediakan sebuah endpoint **Callback URL** (POST). Kami akan mengirimkan paket JSON ke URL tersebut setiap kali Agent membalas.

### Payload Balasan (JSON)

```json
{
  "event": "message.reply",
  "id": "evt_out_888",
  "timestamp": "2024-03-20T10:05:00Z",
  "data": {
    "conversation_id": "chat_session_001",
    "message_id": "msg_agent_999",
    "reply_to_message_id": null,
    "sender": {
      "id": "agent_007",
      "name": "Agent Kurniawan",
      "role": "agent"
    },
    "content": "Baik Pak, sedang kami tangani.",
    "type": "text",
    "attachments": []
  }
}
```

Format `sender`, `type`, dan `attachments` sama dengan format Inbound.

### Keamanan Outbound (Verifikasi Signature)
Kami juga akan mengirimkan header `X-Hub-Signature` (HMAC-SHA256) menggunakan Secret Key yang sama. Anda **WAJIB** memverifikasi signature ini untuk memastikan pesan benar-benar berasal dari sistem kami.

## 6. Mengambil History Chat (API)

Jika Anda perlu menampilkan riwayat percakapan di aplikasi Anda, gunakan API berikut:

*   **Endpoint**: `GET https://[DOMAIN_KAMI]/api/webhook/history/:conversation_id`
*   **Header**: `Authorization: Bearer [ACCESS_TOKEN]`
*   **Query Params**:
    *   `limit`: Jumlah pesan (default 50).
    *   `cursor`: ID pesan terakhir (untuk pagination).

**Contoh Response:**
```json
{
  "data": [
    {
      "id": "msg_001",
      "role": "visitor",
      "content": "Halo",
      "timestamp": "2024-03-20T10:00:00Z",
      "attachments": []
    },
    {
      "id": "msg_agent_999",
      "role": "agent",
      "content": "Halo, ada yang bisa dibantu?",
      "timestamp": "2024-03-20T10:01:00Z",
      "attachments": []
    }
  ]
}
```
