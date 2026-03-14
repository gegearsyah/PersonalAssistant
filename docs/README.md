# Personal Assistant — Documentation

This folder contains the technical implementation plan and API contracts for the Chrome extension + backend + MCP system.

## Documents

| Document | Purpose |
|----------|---------|
| **ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md** | Full architecture, data flow, auth, context extraction, security, tech stack, MCP integration, permissions, rate limiting. Primary spec for implementation. |
| **API_CONTRACTS_AND_PATTERNS.md** | WebSocket and REST API contracts, TypeScript interfaces, backend and extension code patterns. |

## Repo layout (recommended)

```
PersonalAssistant/
├── docs/                    # This folder
├── extension/               # Chrome extension (popup, service worker, content/inject scripts)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── service-worker.js
│   └── ...
├── backend/                 # LLM & MCP connector service
│   ├── package.json or requirements.txt
│   ├── src/
│   └── ...
└── README.md
```

## Quick start (implementation order)

1. Read **ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md** end-to-end.
2. Implement backend: health, auth, WebSocket, Claude streaming (no MCP).
3. Implement extension: popup UI, WebSocket client, mock context.
4. Add context collection (tabs, inject, markdown, package).
5. Integrate MCP: list tools, call tools, feed results back into Claude.
6. Harden: errors, rate limits, token usage, consent, security review.

Refer to **API_CONTRACTS_AND_PATTERNS.md** for exact message shapes and code patterns.
