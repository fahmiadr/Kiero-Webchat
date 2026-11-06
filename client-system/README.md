# Widget Live Chat (Client System)

This project contains the **Client-Facing Chat Widget** and the **Widget Backend** service.
It is designed to be embedded on customer websites to provide live support functionality.

## 📦 Project Structure

This is a Monorepo containing:

*   **`packages/widget-frontend`**: The embeddable Chat Widget (React + Vite).
*   **`packages/widget-backend`**: The intermediary service handling WebSockets and communication with the Agent System.
*   **`test/`**: Contains `mock-backend.js` and `index.html` for local testing.

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   Redis (Required for Queues & Socket.IO Adapter)
*   Docker (Optional, for running Redis)

### 1. Start Redis
```bash
docker run -d -p 6379:6379 redis
```

### 2. Widget Backend (Port 3001)
Handles WebSocket connections from the widget and forwards messages to the Agent System via BullMQ.

```bash
cd packages/widget-backend
cp .env.example .env
npm install
npm run dev
```

### 3. Widget Frontend (Port 5173 / 3000)
The actual chat interface.

```bash
cd packages/widget-frontend
npm install
npm run dev
```

### 4. Local Verification
Open `test/index.html` (via Live Server) or the Vite Preview URL to see the widget in action.

## 🏗 Architecture

### Communication Flow
1.  **Widget (Browser)** connects to **Widget Backend** via `Socket.IO`.
2.  **Widget Backend** pushes messages to `incoming-events` queue (Redis).
3.  **Agent System** (External) consumes `incoming-events`.
4.  **Agent System** replies are pushed to `outgoing-events` queue.
5.  **Widget Backend** consumes `outgoing-events` and forwards to Widget via WebSocket.

### Security
*   **HMAC SHA256**: All outgoing messages to the Agent System are signed with a Tenant Secret.
*   **CORS**: Restricted to configured origins.

## 🛠 Tech Stack
*   **Runtime**: Node.js
*   **Queue**: BullMQ (Robust, persistent queue)
*   **WebSocket**: Socket.IO + Redis Adapter
*   **Framework**: Fastify (Backend), React + Tailwind (Frontend)

## 📝 Configuration
See `packages/widget-backend/src/config/index.js` for tenant and Redis configuration.
