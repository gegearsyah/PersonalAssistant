# Connectors & tools (Google, Notion, etc.)

In this project the backend implements **its own** Google tools (Calendar, Docs) and requests only the OAuth scopes those APIs need. You can instead connect to **external** Google MCP servers (they do exist); see the note below.

---

## “Why can’t we have connectors like Claude? Easy and one-click?”

**Claude does build their own.** The “Connect to Google Drive / Notion” you see on Claude.ai or in the Claude app is **Anthropic’s product**. Their backend does OAuth, stores tokens, and calls Google/Notion (or partner APIs) themselves. It’s not a generic API feature — it’s part of their app. So yes: **they make their own connectors**, same idea as us, just at product scale with a full team.

**We’re doing the same on a smaller scale.** We built our own Google (Calendar, Docs) and one “Connect Google” in the extension. For more tools (Brave Search, NotebookLM, Todo, etc.) we use external MCP servers and a single config string (`MCP_SERVERS_JSON`). The “hard” bit is that today you have to edit that JSON or `.env` by hand.

**Making it easier (Claude-style):** We could add an **optional “Connector setup”** in the extension or a small admin page that:
- Lists known integrations (e.g. Brave Search, NotebookLM, Todo, Time) with a toggle and one field each (API key, config path, etc.),
- Builds the correct `MCP_SERVERS_JSON` for you and either shows it to **copy into `.env`** or, if the backend supports it, **saves it** so you don’t touch JSON at all.

So: **Claude also makes their own connectors**; we can get close to “easy and one-click” by adding a simple UI that generates (or persists) the MCP config instead of asking users to edit JSON. The doc [EXTERNAL_MCP_FOR_STUDENTS.md](EXTERNAL_MCP_FOR_STUDENTS.md) already has the building blocks; a future step is that wizard or settings screen.

---

## Why we request specific scopes (and is there an external Google MCP?)

**Why scopes are “limited” here**  
The backend doesn’t connect to an external MCP server that provides Google. It **implements the tools itself** and calls Google’s APIs (Calendar, Docs) directly. So we only request the OAuth scopes required for the APIs we actually use. We’re not “limiting” arbitrarily; we only ask for what our code needs.

**Is it possible to use an external Google MCP? Yes.**  
External Google MCP servers **do exist**. For example:

- [Google Drive MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/google-drive) (official MCP servers repo)
- Other community or hosted MCPs that expose Google (Drive, Gmail, Calendar, etc.)

If we **connected** to one of those (e.g. run it as a separate process, or call a hosted MCP endpoint), we would get whatever tools that server exposes (list_tools / call_tool). That server would have its **own** credential setup (env vars, OAuth, or config); we wouldn’t be the ones defining scopes in our app.

So: **it is possible** to use an external Google MCP. In this repo we chose to **build our own** Google tools and request the scopes we need. If you prefer “connect to MCP and get its tool list,” you’d integrate the backend with an external MCP server (and use that server’s setup).

---

## Why don’t I see “connectors” like in Claude.ai?

**Claude.ai** and the **Claude desktop app** have built-in integrations (e.g. “Connect to Google Drive”, “Connect to Notion”) that are part of Anthropic’s own product. Those are **not** included in the **Claude API** that this app uses.

This extension talks to **your backend**, which calls the **API** (Claude, OpenAI, or Groq). The API is just the model: send messages, get replies, and optionally use **tools**. There are no one‑click “connect to Google/Notion” buttons in the API.

## How do “connectors” work here?

In this project, external integrations are provided by **MCP (Model Context Protocol) servers**. Each MCP server can expose **tools** (e.g. “search Notion”, “list Google Drive files”). The model then decides when to call those tools during the conversation.

- **In this repo:** The backend implements an MCP-style client with built-in tools: **Google** (Calendar, Docs) using your OAuth connection, plus demo tools `echo` and `add`. So we request only the scopes we need (calendar, documents). No external MCP server is used for Google.
- **Alternative:** You can instead connect the backend to **external MCP servers** (e.g. official Google Drive MCP, Notion MCP). Those servers expose their own tool list and have their own credential setup.

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
