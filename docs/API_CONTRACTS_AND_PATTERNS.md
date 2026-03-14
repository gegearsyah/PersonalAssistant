# API Contracts & Code Patterns

Companion to **ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md**. Defines exact request/response shapes, WebSocket message types, and implementation patterns for the Chrome extension and backend.

---

## 1. WebSocket API Contract

### 1.1 Connection

- **URL:** `wss://<backend_host>/v1/ws` or `wss://<backend_host>/ws`
- **Headers (browser):** Cannot set custom headers from browser WebSocket; use query param: `wss://.../ws?token=<opaque_token>` or send first frame as JSON auth (see below).
- **Origin:** Backend MUST validate `Origin` (e.g. `chrome-extension://<id>`).

### 1.2 Message Format

All messages are JSON-serialized objects. One JSON object per WebSocket text frame (no newline-delimited batching in this spec).

### 1.3 Client → Server Messages

#### Auth (if not using query token)

```json
{
  "type": "auth",
  "token": "backend_api_key_or_jwt"
}
```

#### Chat request

```json
{
  "type": "chat",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Summarize the main points from my open tabs.",
  "context": {
    "tabs": [
      {
        "id": 123,
        "url": "https://example.com/article",
        "title": "Example Article",
        "markdown": "## Tab: Example Article (https://example.com/article)\n\nFirst paragraph..."
      }
    ],
    "closed_tabs": [
      { "url": "https://example.com/other", "title": "Other", "markdown": null }
    ],
    "totalChars": 12000,
    "truncated": false
  },
  "allow_tools": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | `"chat"` |
| id | string | Yes | UUID v4 for idempotency / correlation |
| message | string | Yes | User message, max length enforced by backend (e.g. 32k chars) |
| context | object | No | Omit or `{}` for no context |
| context.tabs | array | No | Open tab markdown entries |
| context.closed_tabs | array | No | Recently closed (URL/title, optional markdown) |
| allow_tools | boolean | No | If true, backend may call MCP tools; default true |

#### Ping (keepalive)

```json
{ "type": "ping" }
```

### 1.4 Server → Client Messages

#### Auth result

```json
{ "type": "auth_ok" }
```

```json
{ "type": "error", "code": "unauthorized", "message": "Invalid token" }
```

#### Text delta (streaming)

```json
{ "type": "text_delta", "delta": "Hello, " }
```

```json
{ "type": "text_delta", "delta": "world." }
```

#### Tool use (streaming or final)

```json
{
  "type": "tool_use",
  "id": "toolu_01AbCdEf",
  "name": "get_weather",
  "input": { "location": "San Francisco" }
}
```

- For fine-grained streaming, `input` may be sent in chunks; client may buffer until `done` or next event.

#### Tool result (for UI)

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01AbCdEf",
  "content": "72°F, partly cloudy."
}
```

#### Stream done

```json
{
  "type": "done",
  "message_id": "msg_01XyZ",
  "usage": { "input_tokens": 1500, "output_tokens": 200 }
}
```

#### Error (fatal for this request)

```json
{
  "type": "error",
  "code": "rate_limited",
  "message": "Too many requests; retry after 60s"
}
```

#### Pong

```json
{ "type": "pong" }
```

### 1.5 Error Codes (normative)

| code | HTTP-like | Meaning |
|------|-----------|---------|
| unauthorized | 401 | Invalid or missing auth |
| forbidden | 403 | Auth valid but not allowed |
| bad_request | 400 | Invalid payload (e.g. missing message) |
| rate_limited | 429 | Backend or upstream rate limit |
| server_error | 500 | Internal error |
| upstream_error | 502 | Claude or MCP unreachable / error |

---

## 2. REST Fallback (SSE Stream)

### 2.1 POST /v1/chat

- **Method:** POST  
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>` or `X-API-Key: <key>`  
- **Body:** Same as WebSocket chat payload (without `type`):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "User message here",
  "context": { "tabs": [], "closed_tabs": [] },
  "allow_tools": true
}
```

- **Response:** `200 OK`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` (if nginx).

### 2.2 SSE Event Types

Each event is `event: <type>\ndata: <json>\n\n`.

- **text_delta:** `data: {"delta":"chunk"}`  
- **tool_use:** `data: {"id":"...","name":"...","input":{...}}`  
- **tool_result:** `data: {"tool_use_id":"...","content":"..."}`  
- **done:** `data: {"message_id":"...","usage":{...}}`  
- **error:** `data: {"code":"...","message":"..."}`  

After `done` or `error`, close the stream.

---

## 3. TypeScript Interfaces (Shared)

Use these in both extension and backend for type safety.

```ts
// context payload (extension -> backend)
export interface ContextTab {
  id: number;
  url: string;
  title: string;
  markdown: string | null;
}

export interface ClosedTabRef {
  url: string;
  title: string;
  markdown: string | null;
}

export interface ContextPayload {
  tabs: ContextTab[];
  closed_tabs: ClosedTabRef[];
  totalChars?: number;
  truncated?: boolean;
}

// websocket client -> server
export type ClientMessage =
  | { type: 'auth'; token: string }
  | {
      type: 'chat';
      id: string;
      message: string;
      context?: ContextPayload;
      allow_tools?: boolean;
    }
  | { type: 'ping' };

// websocket server -> client
export type ServerMessage =
  | { type: 'auth_ok' }
  | { type: 'error'; code: string; message: string }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | {
      type: 'done';
      message_id?: string;
      usage?: { input_tokens: number; output_tokens: number };
    }
  | { type: 'pong' };
```

---

## 4. Backend Code Patterns

### 4.1 WebSocket Handler (Pseudocode — Node/Fastify)

```ts
fastify.get('/ws', { websocket: true }, (socket, req) => {
  let authenticated = false;
  const token = new URL(req.url, 'http://x').searchParams.get('token');

  function send(msg: ServerMessage) {
    socket.send(JSON.stringify(msg));
  }

  socket.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString()) as ClientMessage;
    if (msg.type === 'auth' && !authenticated) {
      const ok = await validateToken(msg.token);
      if (ok) {
        authenticated = true;
        send({ type: 'auth_ok' });
      } else {
        send({ type: 'error', code: 'unauthorized', message: 'Invalid token' });
        socket.close();
      }
      return;
    }
    if (!authenticated && msg.type !== 'auth') {
      send({ type: 'error', code: 'unauthorized', message: 'Authenticate first' });
      return;
    }
    if (msg.type === 'ping') {
      send({ type: 'pong' });
      return;
    }
    if (msg.type === 'chat') {
      await handleChatStream(msg, send);
      return;
    }
  });
});
```

### 4.2 Claude Stream + Tool Loop (Pseudocode)

```ts
async function handleChatStream(
  msg: Extract<ClientMessage, { type: 'chat' }>,
  send: (m: ServerMessage) => void
) {
  const system = buildSystemPrompt(msg.context);
  const messages: ClaudeMessage[] = [
    { role: 'user', content: system + '\n\n' + (msg.context?.tabs?.map(t => t.markdown).join('\n\n') ?? '') + '\n\nUser: ' + msg.message }
  ];
  let maxTurns = 5;
  while (maxTurns--) {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPromptOnly,
      messages,
      stream: true
    });
    let toolUses: Array<{ id: string; name: string; input: unknown }> = [];
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') send({ type: 'text_delta', delta: delta.text });
        if (delta.type === 'tool_use') {
          toolUses.push({ id: delta.id, name: delta.name, input: delta.input });
          send({ type: 'tool_use', id: delta.id, name: delta.name, input: delta.input });
        }
      }
    }
    const final = await stream.finalMessage();
    // Append assistant message with content blocks (text + tool_use)
    messages.push({ role: 'assistant', content: final.content });
    if (toolUses.length === 0) break;
    for (const tu of toolUses) {
      const result = await mcpClient.callTool(tu.name, tu.input);
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: tu.id, content: result }]
      });
      send({ type: 'tool_result', tool_use_id: tu.id, content: result });
    }
  }
  send({ type: 'done', usage: lastUsage });
}
```

(Actual implementation must align with Anthropic SDK’s stream event shapes and multi-step tool-use pattern; see official docs.)

### 4.3 MCP tools/call (Pseudocode)

```ts
// After tools/list at startup
const tools = await mcpClient.listTools();

async function callTool(name: string, input: unknown): Promise<string> {
  const result = await mcpClient.callTool(name, input);
  return typeof result === 'string' ? result : JSON.stringify(result);
}
```

---

## 5. Extension Code Patterns

### 5.1 Context Collection (Service Worker)

```ts
async function collectContext(): Promise<ContextPayload> {
  const tabs = await chrome.tabs.query({});
  const contextTabs: ContextTab[] = [];
  const limit = 20;
  const maxCharsPerTab = 12000;
  let totalChars = 0;
  const maxTotal = 100000;

  for (const tab of tabs.slice(0, limit)) {
    if (!tab.id || !tab.url || tab.url.startsWith('chrome://')) continue;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContent
      });
      const raw = results?.[0]?.result as string | undefined;
      const markdown = raw ? htmlToMarkdown(raw) : null;
      const truncated = markdown && markdown.length > maxCharsPerTab
        ? markdown.slice(0, maxCharsPerTab) + '\n\n[truncated]'
        : markdown;
      const len = (truncated ?? '').length;
      if (totalChars + len > maxTotal) break;
      totalChars += len;
      contextTabs.push({
        id: tab.id,
        url: tab.url,
        title: tab.title ?? '',
        markdown: truncated
      });
    } catch {
      contextTabs.push({ id: tab.id!, url: tab.url!, title: tab.title ?? '', markdown: null });
    }
  }

  return {
    tabs: contextTabs,
    closed_tabs: [],
    totalChars,
    truncated: totalChars >= maxTotal
  };
}

function extractPageContent(): string {
  const el = document.body ?? document.documentElement;
  return el?.innerHTML ?? '';
}
```

- `extractPageContent` is injected; use a readability step or a small inline script. `htmlToMarkdown` can run in the service worker (e.g. Turndown).

### 5.2 WebSocket Client (Popup or Service Worker)

```ts
function connectWS(): WebSocket {
  const token = getStoredToken(); // from chrome.storage.local
  const url = `${BACKEND_WS_URL}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as ServerMessage;
    if (msg.type === 'text_delta') appendToChat(msg.delta);
    if (msg.type === 'tool_use') showToolUse(msg.name, msg.input);
    if (msg.type === 'tool_result') showToolResult(msg.tool_use_id, msg.content);
    if (msg.type === 'done') setStreamDone();
    if (msg.type === 'error') showError(msg.message);
  };
  return ws;
}
```

### 5.3 Sending a Chat Message

```ts
const ws = connectWS();
await waitForAuth(ws); // after auth_ok
ws.send(JSON.stringify({
  type: 'chat',
  id: crypto.randomUUID(),
  message: userInput,
  context: await collectContext(),
  allow_tools: true
}));
```

---

## 6. Integration Checklist

- [ ] Backend validates `Origin` for WebSocket and CORS for REST.
- [ ] Backend enforces max message length and context size.
- [ ] Extension never logs or sends API keys in plain text to console/network except to backend over wss/https.
- [ ] Tool results are sanitized before rendering in UI (no raw HTML from tools).
- [ ] Ping/pong or heartbeat to keep WebSocket alive behind proxies.

---

*Use this document together with ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md for implementation.*
