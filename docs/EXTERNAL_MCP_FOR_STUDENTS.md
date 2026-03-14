# External MCP Servers for Students (Research Summary)

This doc lists **external MCP (Model Context Protocol) servers** that are especially useful for a **student-focused personal assistant**: calendar, docs, **NotebookLM**, notes, tasks, search, PDFs, and knowledge tracking. The backend **integrates** them: set `MCP_SERVERS_JSON` and the assistant gets all their tools (built-in Google + external) in one place.

---

## Integration (use everything in this project)

The backend **already supports** external MCP servers. You don’t change code — you add config.

1. **Set `MCP_SERVERS_JSON`** in `backend/.env` to a JSON array of server configs. Each entry:
   - **`id`** (string): short name for this server (e.g. `brave`, `time`).
   - **`command`** (string): executable to run (e.g. `npx`, `node`, `python`).
   - **`args`** (array of strings, optional): arguments (e.g. `["-y", "@modelcontextprotocol/server-brave-search"]`).
   - **`env`** (object, optional): extra env vars (e.g. `{ "BRAVE_API_KEY": "your-key" }`).

2. **Restart the backend.** On first chat that uses tools, the backend connects to each server (stdio), fetches `tools/list`, and merges them with built-in tools (Google Calendar, Google Docs, echo, add). Tool names from built-in take precedence; then external tools are added.

3. **Example — Brave Search + Time (no keys for Time):**
   ```bash
   # One line, no line breaks inside the JSON
   MCP_SERVERS_JSON=[{"id":"brave","command":"npx","args":["-y","@modelcontextprotocol/server-brave-search"],"env":{"BRAVE_API_KEY":"YOUR_BRAVE_KEY"}},{"id":"time","command":"npx","args":["-y","@modelcontextprotocol/server-time"]}]
   ```
   Get a Brave API key (free tier): [brave.com/search/api](https://brave.com/search/api).

4. **Example — add Todo list MCP (student tasks):**
   - Install/runnable: e.g. `npx -y todo-list-mcp` or clone [RegiByte/todo-list-mcp](https://github.com/regibyte/todo-list-mcp) and run with `node dist/index.js` (path in `args`).
   - Add one more object to the `MCP_SERVERS_JSON` array with `command` and `args` that start that server.

5. **NotebookLM (Google):** Lets the assistant query your NotebookLM notebooks (sources, Q&A). Requires Python: `pip install notebooklm-mcp`, then `notebooklm-mcp init https://notebooklm.google.com/notebook/YOUR_ID` and a config file. Add to the array: `{"id":"notebooklm","command":"notebooklm-mcp","args":["--config","/path/to/notebooklm-config.json","server"]}`. See **NotebookLM** section below.

6. **More servers** (Notion, Obsidian, PDF, Memory, etc.): same idea. Each runs as a separate process; the backend spawns them and aggregates their tools. See sections below for links and required env/keys.

---

## Where to discover MCP servers

- **Official MCP registry** (preview): [registry.modelcontextprotocol.io](https://modelcontextprotocol.io/registry/about) — REST API for discovering published servers.
- **Official reference servers (GitHub)**: [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — Fetch, Filesystem, Git, Memory, Time, Brave Search, etc.
- **PulseMCP directory**: [pulsemcp.com/servers](https://pulsemcp.com/servers) — 8,500+ servers, searchable; good for browsing by category.
- **Other indexes**: [mcpindex.net](https://mcpindex.net), [mcp.so](https://mcp.so), [playbooks.com/mcp](https://playbooks.com/mcp) — alternative directories.

---

## 1. Google Workspace (Calendar, Gmail, Drive, Docs, Sheets)

Useful for: class schedule, deadlines, email, assignments in Drive/Docs.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **Google Workspace MCP** | Single server: Gmail, Drive, Calendar, Docs, Sheets, Slides, Forms, Tasks, Contacts, Chat, Apps Script. OAuth, multi-account. | [workspacemcp.com](https://workspacemcp.com), [ghaziahamat/google-workspace-mcp](https://github.com/ghaziahamat/google-workspace-mcp) |
| **Google Docs MCP** | Create, read, update, search, share, export Google Docs. | [lkm1developer/google-docs-mcp-server](https://github.com/lkm1developer/google-docs-mcp-server), [mcp-server-directory.com](https://www.mcp-server-directory.com/servers/google-docs-mcp-server) |
| **Google Drive MCP** | Search/list Drive files, read content. (Official one is archived; community alternatives exist.) | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) (archived), [mcpindex.net](https://mcpindex.net/en/mcpserver/modelcontextprotocol-server-google-drive) |

**Note:** These use their own OAuth/credential setup. If you use one, you typically don’t need to implement Calendar/Docs in your backend — the MCP server exposes the tools.

---

## 2. NotebookLM (Google)

Useful for: research, course materials, source-grounded Q&A — the assistant can query your NotebookLM notebooks.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **notebooklm-mcp** | List/query NotebookLM notebooks, add sources, generate audio. Uses your NotebookLM notebook(s) as context. | [PyPI notebooklm-mcp](https://pypi.org/project/notebooklm-mcp/), [jacob-bd/notebooklm-mcp](https://github.com/jacob-bd/notebooklm-mcp) |
| **notebooklm-mcp-2026** | FastMCP-based; query notebooks from Claude, Cursor, VS Code. | [julianoczkowski/notebooklm-mcp-2026](https://github.com/julianoczkowski/notebooklm-mcp-2026), [PyPI](https://pypi.org/project/notebooklm-mcp-2026/) |

**Setup:** Install (e.g. `pip install notebooklm-mcp`), run `notebooklm-mcp init https://notebooklm.google.com/notebook/YOUR_NOTEBOOK_ID`, then start the MCP server with the generated config: `notebooklm-mcp --config notebooklm-config.json server`. Use that `command` + `args` (and full path to config) in `MCP_SERVERS_JSON`.

---

## 3. Notes & knowledge (Notion, Obsidian)

Useful for: class notes, study wikis, linking concepts.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **Notion MCP** | Pages and databases: create, query, search, markdown. OAuth. | [makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server) |
| **Obsidian MCP** | Read/write notes in an Obsidian vault: search, create/update, TODOs, frontmatter, periodic notes. | [cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server), [krisk248/obsidian-notes-mcp](https://github.com/krisk248/obsidian-notes-mcp), [igorilic/obsidian-mcp](https://github.com/igorilic/obsidian-mcp) |

---

## 4. Tasks, todos & reminders

Useful for: homework, deadlines, daily plans.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **Todo List MCP** | Create, list, search, update, complete, delete tasks. Works with Claude Desktop / Cursor. | [RegiByte/todo-list-mcp](https://github.com/regibyte/todo-list-mcp), [mcp.so](https://mcp.so/server/todo-list-mcp/RegiByte) |
| **MCP Tasks** | Tasks in Markdown/JSON/YAML, status (To Do, In Progress, Done), filtering, persistence. | [flesler/mcp-tasks](https://github.com/flesler/mcp-tasks) |
| **MCP Reminder** | Alarms and todos, natural-language times, reminders. | [sheacoding/mcp-reminder](https://github.com/sheacoding/mcp-reminder) |

---

## 5. Search & web (research, assignments)

Useful for: finding sources, checking facts, fetching page content.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **Brave Search MCP** | Web, news, image, video search. Official: [brave/brave-search-mcp-server](https://github.com/brave/brave-search-mcp-server). | Needs Brave Search API key (free tier available). |
| **Fetch / URL** | Fetch web page content, extract text/links. Some combine search + fetch (e.g. search then fetch top results). | Official [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) (Fetch); community “search and fetch” variants. |

---

## 6. PDFs & documents (papers, textbooks, handouts)

Useful for: reading papers, summarizing chapters, extracting citations.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **PDF reader MCPs** | Read text, metadata, pages; search; extract images. | [rturv/mcp-pdf-reader](https://github.com/rturv/mcp-pdf-reader), [SylphxAI/pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp), [pietermyb/mcp-pdf-reader](https://github.com/pietermyb/mcp-pdf-reader) |
| **Academic PDF** | Section detection (Abstract, Methods, etc.), citations, structure. | [averagejoeslab/pdf-reader-mcp](https://github.com/averagejoeslab/pdf-reader-mcp) |

---

## 7. Memory & knowledge (concepts, progress)

Useful for: long-term context, linking courses and concepts.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **Memory (official)** | Knowledge-graph style persistent memory. | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) |
| **Student Knowledge Graph** | Track academic progress, courses, assignments, concepts and relationships. | [PulseMCP – Student Knowledge Graph](https://www.pulsemcp.com/servers/student-knowledge-graph) (Tejpal Virk) |

---

## 8. Utility (time, files, git)

Useful for: “due tomorrow”, file paths, code/repos.

| Server | What it does | Link / notes |
|--------|----------------|--------------|
| **Time** | Time and timezone conversion. | Official in [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) |
| **Filesystem** | Secure file read/write with access controls. | Official in [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) |
| **Git** | Repo operations (read, diff, etc.). | Official (or archived) in [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) |

---

## How this fits your Personal Assistant

- **Built-in:** Google (Calendar, Docs) via Connectors in the extension; we request only the scopes we need.
- **External (integrated):** Set `MCP_SERVERS_JSON` and the backend connects to those MCP servers (stdio), merges their tools with built-in, and routes `call_tool` to the right server. So you get **everything**: built-in Google + Brave Search, Time, Todo, Notion, Obsidian, PDF, Memory, etc., in one assistant.
- **Student-focused combo:** In `.env`, add a `MCP_SERVERS_JSON` array that includes (as many as you want):
  - **NotebookLM** (query your notebooks, source-grounded Q&A) — Python, one-time init with notebook URL
  - **Brave Search** (web search for research) — needs `BRAVE_API_KEY`
  - **Time** (official) — no key
  - **Todo list / Reminder** (homework, deadlines)
  - **Notion** or **Obsidian** (notes) — each has its own setup
  - **PDF reader** (papers, handouts)
  - **Student Knowledge Graph** (if you run it)

Links and names were accurate as of research; repos and sites may have moved — use the registry and PulseMCP to find the latest versions and alternatives.
