from config import CALENDAR_TIMEZONE, MAX_TOOL_TURNS

# Simple in-memory chat history shared per backend process.
# Mirrors the behavior of the Node backend so that multiple turns
# in the extension share context, and can be cleared explicitly.
_CHAT_HISTORY: list[dict] = []

def build_system_prompt(context=None):
    base = f"""You are a helpful personal assistant for students. You have access to the user's browser context (open tabs as markdown) when provided.

## Demo capabilities (use when the user asks)
1. **Ask about the page** — Answer questions about the current page or open tabs using the browser context (titles, URLs, and markdown content). Be specific and cite the page when relevant.
2. **Summarize the page** — When asked to summarize a page or "this page", write a clear summary from the browser context. Do not invent content that is not in the context.
3. **Calendar (deadlines, events)** — When the user mentions deadlines, due dates, meetings, or things to put on the calendar, use create_calendar_event. Examples: "add my deadline next Friday", "remind me tomorrow at 9am", "block Tuesday 2pm for study". List events with list_calendar_events when asked. Timezone: {CALENDAR_TIMEZONE}. Convert user date/time to UTC and use ISO 8601 with Z; default event length 1 hour if not specified.
4. **Put summary in Google Docs** — When the user wants a summary (or any text) saved as a Google Doc, use create_google_doc with a clear title and the full content. For "summarize this page and put it in a doc": first write the summary from the browser context, then call create_google_doc with that summary. Do not create calendar events for document requests.
5. **Other tools** — Use any additional tools from connected MCP servers (e.g. time, web search, fetch, memory) when they fit the request.

Be concise and accurate."""
    if not context or (not context.get("tabs") and not context.get("closed_tabs")):
        return base
    parts = [base]
    if context.get("tabs"):
        parts.append("\n\n## Browser context (open tabs)\n")
        for tab in context["tabs"]:
            if tab.get("markdown"):
                parts.append(tab["markdown"] + "\n\n")
            else:
                parts.append(f"- Tab: {tab.get('title', '')} ({tab.get('url', '')}) — content not available\n")
    if context.get("closed_tabs"):
        parts.append("\n## Recently closed tabs (content unavailable)\n")
        for t in context["closed_tabs"]:
            parts.append(f"- {t.get('title', '')}: {t.get('url', '')}\n")
    return "".join(parts)

def mcp_tool_to_unified(t):
    schema = t.get("inputSchema") or {}
    return {
        "name": t.get("name", ""),
        "description": t.get("description", ""),
        "input_schema": {"type": schema.get("type", "object"), "properties": schema.get("properties", {}), "required": schema.get("required")},
    }

def build_tool_result_messages(provider, tool_uses, results):
    if provider == "claude":
        return [{"role": "user", "content": [{"type": "tool_result", "tool_use_id": tu["id"], "content": results[i] or ""} for i, tu in enumerate(tool_uses)]}]
    return [{"role": "tool", "tool_call_id": tu["id"], "content": results[i] or ""} for i, tu in enumerate(tool_uses)]

def _build_tool_summary(tools):
    if not tools:
        return ""
    names = ", ".join(t.get("name", "") for t in tools)
    return f"\n\n## Available tools (use when relevant)\n{names}."


def clear_chat_history() -> None:
    """Reset in-memory chat history."""
    _CHAT_HISTORY.clear()


def run_chat_stream(message, context, allow_tools, mcp_client, send, llm_options):
    """Sync: run in thread. send(m) is sync and should e.g. queue.put_nowait(m)."""
    from llm import get_adapter, DEFAULT_MODELS
    tools = mcp_client.list_tools() if allow_tools else []
    system_prompt = build_system_prompt(context) + _build_tool_summary(tools)
    unified_tools = [mcp_tool_to_unified(t) for t in tools]
    provider = llm_options.get("provider", "claude")
    api_key = (llm_options.get("api_key") or "").strip()
    model = (llm_options.get("model") or "").strip() or DEFAULT_MODELS.get(provider, "")
    if not api_key:
        send({"type": "error", "code": "bad_request", "message": f"No API key provided. Set your {provider} API key in extension settings."})
        return
    adapter = get_adapter(provider)
    # Start from existing history so that the model can see prior turns.
    messages = list(_CHAT_HISTORY) + [{"role": "user", "content": message}]
    total_in = total_out = 0
    turns_left = MAX_TOOL_TURNS
    while turns_left > 0:
        opts = {"systemPrompt": system_prompt, "messages": messages, "tools": unified_tools, "apiKey": api_key, "model": model}
        result = adapter.stream_turn(opts, send)
        if result.get("usage"):
            total_in += result["usage"].get("input_tokens", 0)
            total_out += result["usage"].get("output_tokens", 0)
        if not result.get("toolUses"):
            # No more tool calls; conversation turn is complete. Persist history.
            _CHAT_HISTORY.clear()
            _CHAT_HISTORY.extend(messages)
            send({"type": "done", "usage": {"input_tokens": total_in, "output_tokens": total_out}})
            return
        messages.append(result["assistantMessage"])
        results = []
        for tu in result["toolUses"]:
            try:
                content = mcp_client.call_tool(tu["name"], tu.get("input") or {})  # sync
            except Exception as e:
                content = str(e)
            send({"type": "tool_result", "tool_use_id": tu["id"], "content": content})
            results.append(content)
        messages.extend(build_tool_result_messages(provider, result["toolUses"], results))
        turns_left -= 1
    # Tool turn limit reached; persist what we have.
    _CHAT_HISTORY.clear()
    _CHAT_HISTORY.extend(messages)
    send({"type": "done", "usage": {"input_tokens": total_in, "output_tokens": total_out}})
