import json
import httpx

def create_openai_compat_adapter(base_url: str):
    def stream_turn(opts, send):
        messages = [{"role": "system", "content": opts["systemPrompt"]}] if opts.get("systemPrompt") else []
        messages += opts["messages"]
        body = {
            "model": opts["model"],
            "stream": True,
            "max_tokens": 4096,
            "messages": messages,
        }
        if opts.get("tools"):
            body["tools"] = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t.get("input_schema", {})}} for t in opts["tools"]]
            body["tool_choice"] = "auto"

        url = f"{base_url.rstrip('/')}/chat/completions"
        with httpx.stream("POST", url, json=body, headers={"Authorization": f"Bearer {opts['apiKey']}", "Content-Type": "application/json"}, timeout=120.0) as r:
            r.raise_for_status()
            by_index = {}
            for line in r.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data)
                    choice = (chunk.get("choices") or [{}])[0]
                    delta = choice.get("delta") or {}
                    if delta.get("content"):
                        send({"type": "text_delta", "delta": delta["content"]})
                    for tc in delta.get("tool_calls") or []:
                        idx = tc.get("index", 0)
                        cur = by_index.setdefault(idx, {"id": "", "name": "", "args": ""})
                        if tc.get("id"):
                            cur["id"] = tc["id"]
                        if tc.get("function", {}).get("name"):
                            cur["name"] = tc["function"]["name"]
                        if tc.get("function", {}).get("arguments"):
                            cur["args"] += tc["function"]["arguments"]
                except json.JSONDecodeError:
                    pass

        tool_uses = []
        for _, tc in sorted(by_index.items()):
            if tc.get("id") and tc.get("name"):
                try:
                    inp = json.loads(tc.get("args") or "{}")
                except json.JSONDecodeError:
                    inp = {}
                tool_uses.append({"id": tc["id"], "name": tc["name"], "input": inp})
                send({"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": inp})

        return {"toolUses": tool_uses, "assistantMessage": {"role": "assistant", "content": ""}}
    return type("Adapter", (), {"stream_turn": stream_turn})()
