# Connectors & tools (Google, Notion, etc.)

## Why don’t I see “connectors” like in Claude.ai?

**Claude.ai** and the **Claude desktop app** have built-in integrations (e.g. “Connect to Google Drive”, “Connect to Notion”) that are part of Anthropic’s own product. Those are **not** included in the **Claude API** that this app uses.

This extension talks to **your backend**, which calls the **API** (Claude, OpenAI, or Groq). The API is just the model: send messages, get replies, and optionally use **tools**. There are no one‑click “connect to Google/Notion” buttons in the API.

## How do “connectors” work here?

In this project, external integrations are provided by **MCP (Model Context Protocol) servers**. Each MCP server can expose **tools** (e.g. “search Notion”, “list Google Drive files”). The model then decides when to call those tools during the conversation.

- **Right now:** The backend uses a **demo** MCP client with two fake tools: `echo` and `add`. So you’ll see “Tools: Demo (echo, add)” in the popup. The model can use them, but they’re not real Google/Notion connectors.
- **To get real connectors:** You (or your backend) need to run or connect to **real MCP servers** that implement Google, Notion, etc., and configure the backend to use them.

## How to add real connectors (e.g. Notion, Google)

1. **Choose an MCP server**  
   Community and official MCP servers exist for many services, for example:
   - [Notion MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/notion)
   - [Google Drive MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/google-drive)  
   Check [MCP servers list](https://github.com/modelcontextprotocol/servers) for more.

2. **Run the MCP server**  
   Most are run as a separate process (e.g. Node or Python). You pass config (API keys, etc.) via env or config file. The server speaks MCP over stdio or SSE.

3. **Connect the backend to the MCP server**  
   The backend’s MCP client (see `backend/src/mcp.ts`) is currently a **mock**. To support real connectors:
   - Use the official `@modelcontextprotocol/sdk` (or the Python `mcp` package) in the backend.
   - Configure one or more MCP server processes (command line or URL for SSE).
   - In the backend, call `list_tools()` and `call_tool()` against those servers and pass results back into the LLM conversation.

4. **No change needed in the extension**  
   The extension only sends the user message (and optional tab context) to the backend. The backend is responsible for calling the LLM and MCP. When you add real MCP servers, the model will start using those tools automatically; the popup can later be updated to show “Tools: Notion, Google Drive” (or similar) if the backend exposes that info.

## Summary

| What you see in Claude.ai / Claude app | What this app uses |
|----------------------------------------|---------------------|
| Built‑in “Connect to Google / Notion” buttons | None in the API; we use the **API** only |
| Integrations maintained by Anthropic | **MCP servers** you run and connect to the backend |
| One‑click in the product UI | Configure MCP servers in the backend; tools then work in chat |

The **Tools** line in the extension popup (“Demo (echo, add)”) is there to make it clear that tools/connectors in this app come from the backend’s MCP setup, not from a built‑in list inside the extension.
