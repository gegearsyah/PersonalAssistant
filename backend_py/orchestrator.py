from config import CALENDAR_TIMEZONE, MAX_TOOL_TURNS

def build_system_prompt(context=None):
    base = f"""You are a helpful personal assistant for students. You have access to the user's browser context (open tabs as markdown) when provided. When the user has connected Google, you can: (1) create and list calendar events with create_calendar_event and list_calendar_events; (2) create a new Google Doc with create_google_doc (title and content). For "summarize this page and put it in a new doc": use the browser context to write the summary, then call create_google_doc. Do not create calendar events for document requests. The user's calendar timezone is {CALENDAR_TIMEZONE}. For calendar events, convert user date/time to UTC and use ISO 8601 with Z; if the user does not specify event length, use 1 hour. You may also have additional tools from connected MCP servers (e.g. web search, time, tasks, notes); use them when they fit the user's request. Be concise and accurate."""
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

def run_chat_stream(message, context, allow_tools, mcp_client, send, llm_options):
    """Sync: run in thread. send(m) is sync and should e.g. queue.put_nowait(m)."""
    from llm import get_adapter, DEFAULT_MODELS
    system_prompt = build_system_prompt(context)
    tools = mcp_client.list_tools() if allow_tools else []
    unified_tools = [mcp_tool_to_unified(t) for t in tools]
    provider = llm_options.get("provider", "claude")
    api_key = (llm_options.get("api_key") or "").strip()
    model = (llm_options.get("model") or "").strip() or DEFAULT_MODELS.get(provider, "")
    if not api_key:
        send({"type": "error", "code": "bad_request", "message": f"No API key provided. Set your {provider} API key in extension settings."})
        return
    adapter = get_adapter(provider)
    messages = [{"role": "user", "content": message}]
    total_in = total_out = 0
    turns_left = MAX_TOOL_TURNS
    while turns_left > 0:
        opts = {"systemPrompt": system_prompt, "messages": messages, "tools": unified_tools, "apiKey": api_key, "model": model}
        result = adapter.stream_turn(opts, send)
        if result.get("usage"):
            total_in += result["usage"].get("input_tokens", 0)
            total_out += result["usage"].get("output_tokens", 0)
        if not result.get("toolUses"):
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
    send({"type": "done", "usage": {"input_tokens": total_in, "output_tokens": total_out}})
