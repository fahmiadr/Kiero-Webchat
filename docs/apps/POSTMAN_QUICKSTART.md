# Panduan Test Postman (External Integration)

Berikut adalah panduan cepat untuk menguji integrasi menggunakan `curl` atau **Postman**.

Saya telah membuatkan Akun Test dengan kredensial berikut:
*   **Page ID**: `ext_3b728577`
*   **Token**: `test_token_9090d3a533133919596b39b08a5a39f9`
*   **Secret**: `whsec_1f1ea831bae47b4143f48c37251174f1144f33e15fbaa456`

---

## 1. Kirim Pesan (Inbound)

Coba kirim pesan baru sebagai "User Postman".
(Jika Anda menggunakan Postman, Anda bisa Import Raw Text di bawah ini).

**Penting:** Jika Anda mengirim ulang, ubah `message_id` agar tidak dianggap duplikat.

```bash
curl --location 'http://localhost:3002/api/webhook/inbound' \
--header 'Authorization: Bearer test_token_9090d3a533133919596b39b08a5a39f9' \
--header 'Content-Type: application/json' \
--header 'X-Hub-Signature: sha256=878b4ddeb98c3283785a4c797fdc3eb33fa7f2e722540a61c2217f72a127' \
--data '{
  "event": "message.created",
  "id": "evt_test_1",
  "timestamp": "2026-01-23T10:00:00Z",
  "data": {
    "conversation_id": "chat_postman_01",
    "message_id": "msg_postman_01",
    "sender": {
      "id": "user_postman",
      "name": "Postman User",
      "role": "visitor"
    },
    "content": "Hello World from Postman!",
    "type": "text",
    "attachments": []
  }
}'
```

---

## 2. Ambil History (Get History)

Setelah pesan terkirim, Anda bisa mengambil history chat tersebut.

```bash
curl --location 'http://localhost:3002/api/webhook/history/chat_postman_01' \
--header 'Authorization: Bearer test_token_9090d3a533133919596b39b08a5a39f9'
```

---

## 3. Postman Automation (Script Otomatis)

Agar Anda tidak perlu menghitung signature manual setiap kali mengubah JSON, gunakan **Pre-request Script** di Postman.

1.  Buat Request baru di Postman.
2.  Masuk ke tab **Pre-request Script**.
3.  Paste kode berikut:

```javascript
// Postman Pre-request Script untuk HMAC SHA256
const secret = "whsec_1f1ea831bae47b4143f48c37251174f1144f33e15fbaa456"; // Secret Key Test App

// Ambil body request saat ini
const payload = request.data; 

// Generate HMAC
const signature = CryptoJS.HmacSHA256(payload, secret).toString(CryptoJS.enc.Hex);

// Set header otomatis
pm.request.headers.add({
    key: "X-Hub-Signature",
    value: "sha256=" + signature
});

// Update ID pesan agar unik setiap kali kirim (Opsional)
// pm.environment.set("current_timestamp", new Date().toISOString());
```

Dengan script ini, Anda bebas mengubah Body JSON, dan Postman akan otomatis menghitung signature yang valid saat tombol Send ditekan.

---

## 4. Ambil Chat Aktif (Get Active Conversations)

Untuk melihat daftar percakapan yang sedang berlangsung (status `open`) untuk akun integrasi ini.

```bash
curl --location 'http://localhost:3002/api/webhook/conversations?limit=20&page=1' \
--header 'Authorization: Bearer test_token_9090d3a533133919596b39b08a5a39f9'
```

---

## 5. Kirim Pesan ke Chat Tertentu (Reply/Send Message)

Alih-alih menggunakan Inbound Event yang kompleks, Anda bisa langsung mengirim pesan ke `conversation_id` tertentu.

```bash
curl --location 'http://localhost:3002/api/webhook/conversations/chat_postman_01/messages' \
--header 'Authorization: Bearer test_token_9090d3a533133919596b39b08a5a39f9' \
--header 'Content-Type: application/json' \
--data '{
    "content": "Ini pesan balasan dari Agent Eksternal.",
    "type": "text",
    "agent": {
        "id": "agent_ext_001",
        "name": "Budi (External)"
    }
}'
```


