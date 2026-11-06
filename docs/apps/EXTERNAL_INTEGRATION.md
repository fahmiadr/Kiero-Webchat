# External Webhook Integration

**Version:** 2.1.0

This document details the integration between the Kiero Agent System and External Agent Servers.

---

## 1. Outbound Webhook (Agent → External)

**Configuration:** Set `url_api` and `token` in your Social Media Account config.

### Request Format
**Headers:**
```http
Content-Type: application/json
Authorization: Bearer <your-token>
X-WebChat-Event: <event-name>  (e.g., message:visitor)
X-WebChat-Page-Id: <page-id>   (e.g., demo)
```

**Body:** Direct JSON payload (unwrapped).

### Events

#### A. Visitor Message (`message:visitor`)
Sent when a visitor sends a message while the Bot is INACTIVE (waiting or talking to agent).
```json
{
  "channel_id": "demo",
  "interaction_id": "INT123456789",
  "messages": [
    {
      "id": "MSG-001",
      "is_bot": false,
      "from": {
        "id": "VISITOR-ID",
        "name": "John Doe",
        "username": "john@example.com"
      },
      "type": "text",
      "text": "Hello, I need help",
      "timestamp": 1738076603
    }
  ]
}
```

#### B. Visitor Typing (`typing:visitor`)
Sent when a visitor starts/stops typing while the Bot is INACTIVE.
```json
{
  "channel_id": "demo",
  "interaction_id": "INT123456789",
  "messages": [
    {
      "is_bot": false,
      "from": { ... },
      "type": "typing",
      "is_typing": true,
      "timestamp": 1738076605
    }
  ]
}
```

#### C. Chat Closed (`chat:closed`)
Sent when a visitor closes the chat manually while the Bot is INACTIVE.
```json
{
  "channel_id": "demo",
  "interaction_id": "INT123456789",
  "closed_by": "visitor",
  "timestamp": 1738076610
}
```

#### D. Chat History (`chat:history`)
Sent **ONCE** when a visitor requests an agent (`waitingAgent` status). Contains the full conversation log (Visitor + Bot).
```json
{
  "channel_id": "demo",
  "interaction_id": "INT123456789",
  "messages": [
    { "id": "MSG-001", "is_bot": true, "text": "Welcome...", ... },
    { "id": "MSG-002", "is_bot": false, "text": "I need support", ... }
  ]
}
```

---

## 2. Inbound Webhook (External → Agent)

**Endpoint:** `POST /api/webhook/external`
**Header:** `Authorization: Bearer <your-token>`

### Events

#### A. Send Agent Message (`message:send`)
Reply to the visitor.
```json
{
  "event": "message:send",
  "payload": {
    "interactionId": "INT123456789",
    "content": "Hello, how can I help you?",
    "type": "text",
    "agentId": "ext_agent_001",
    "agentName": "Agent Smith",
    "agentRole": "agent",
    "attachments": [] 
  }
}
```

#### B. Mark Messages as Read (`message:read`)
Mark specific visitor messages as read.
```json
{
  "event": "message:read",
  "payload": {
    "interactionId": "INT123456789",
    "messageIds": ["MSG-001"]
  }
}
```
*Note: `messageIds` must be an array, even for a single message (e.g., `["MSG-001", "MSG-002"]`).*

#### C. Agent Typing (`message:typing`)
Show or hide typing indicator to the visitor.
```json
{
  "event": "message:typing",
  "payload": {
    "interactionId": "INT123456789",
    "isTyping": true,
    "agentId": "ext_agent_001",
    "agentName": "Agent Smith",
    "agentRole": "agent"
  }
}
```

#### D. Handle Chat (`chat:handle`)
Take over a chat (assign to agent).
```json
{
  "event": "chat:handle",
  "payload": {
    "interactionId": "INT123456789",
    "agentId": "ext_agent_001",
    "agentName": "Agent Smith",
    "agentRole": "agent"
  }
}
```

#### E. Close Chat (`chat:close`)
End the chat session.
```json
{
  "event": "chat:close",
  "payload": {
    "interactionId": "INT123456789",
    "agentId": "ext_agent_001",
    "agentName": "Agent Smith",
    "agentRole": "agent",
    "reason": "Agent closed the chat"
  }
}
```

#### F. Transfer Chat (`chat:transfer`)
Transfer chat to another agent.
```json
{
  "event": "chat:transfer",
  "payload": {
    "interactionId": "INT123456789",
    "agentId": "ext_agent_001",
    "to": {
      "agentId": "target_agent_002",
      "agentName": "Agent Brown",
      "agentRole": "agent"
    }
  }
}
```
