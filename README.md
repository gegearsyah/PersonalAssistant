# Personal Assistant — Chrome Extension + Backend + MCP

Chrome extension that provides a Claude-style chat interface, collects browser context from open (and optionally closed) tabs, and streams responses from a backend that connects to **Anthropic’s Claude API** and **Model Context Protocol (MCP)** servers.

## Architecture overview

- **Frontend:** Chrome extension (chat popup, context collection trigger, real-time streaming).
- **Backend:** LLM & MCP connector (Claude API client, MCP client, tool execution, WebSocket/REST API).
- **Context:** HTML from open tabs → markdown → packaged with user message → sent to Claude.

See **[docs/ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md](docs/ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md)** for the full technical specification.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md](docs/ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md) | Architecture, data flow, auth, context extraction, security, tech stack, MCP, permissions, rate limiting. |
| [docs/API_CONTRACTS_AND_PATTERNS.md](docs/API_CONTRACTS_AND_PATTERNS.md) | WebSocket/REST contracts, TypeScript types, backend and extension code patterns. |
| [docs/PERMISSIONS_REFERENCE.md](docs/PERMISSIONS_REFERENCE.md) | Extension permissions summary and alternatives. |
| [docs/README.md](docs/README.md) | Doc index and suggested implementation order. |

## Project structure (target)

```
PersonalAssistant/
├── docs/           # Specifications and references (above)
├── extension/      # Chrome extension (manifest, popup, service worker)
├── backend/        # LLM & MCP connector (e.g. Node/TS or Python)
└── README.md       # This file
```

## Implementation order

1. Backend skeleton (auth, WebSocket, health).
2. Claude client (streaming messages).
3. Extension popup + WebSocket client + mock context.
4. Context collection (tabs, inject, markdown, size limits).
5. End-to-end: real context → backend → Claude → stream to UI.
6. MCP: connect servers, list/call tools, feed results back to Claude.
7. Hardening: errors, rate limits, token usage, consent, security.

## Prerequisites

- **Backend:** Anthropic API key (stored in backend env only). Optional: MCP servers.
- **Extension:** Backend URL and, if used, backend API token (e.g. in extension options).
- **Chrome:** Load unpacked extension from `extension/` (add placeholder icons under `extension/icons/` if needed).

---

*Start with [docs/ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md](docs/ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md) for implementation.*
