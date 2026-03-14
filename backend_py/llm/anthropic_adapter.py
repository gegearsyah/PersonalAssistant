import json
import anthropic

class AnthropicAdapter:
    def stream_turn(self, opts, send):
        client = anthropic.Anthropic(api_key=opts["apiKey"])
        messages = opts["messages"]
        tool_uses = []
        current_id = current_name = None
        current_json = ""

        stream_opts = {
            "model": opts["model"],
            "max_tokens": 4096,
            "system": opts["systemPrompt"],
            "messages": messages,
        }
        if opts.get("tools"):
            stream_opts["tools"] = opts["tools"]
            stream_opts["tool_choice"] = {"type": "auto"}

        with client.messages.stream(**stream_opts) as stream:
            for event in stream:
                if getattr(event, "type", None) == "content_block_delta":
                    delta = getattr(event, "delta", {}) or {}
                    if delta.get("type") == "text_delta" and delta.get("text"):
                        send({"type": "text_delta", "delta": delta["text"]})
                    if delta.get("type") == "tool_use":
                        current_id = delta.get("id")
                        current_name = delta.get("name")
                        current_json = ""
                        tool_uses.append({"id": current_id, "name": current_name, "input": {}})
                        send({"type": "tool_use", "id": current_id, "name": current_name, "input": {}})
                    if delta.get("type") == "input_json_delta":
                        current_json += delta.get("partial_json", "")
                if getattr(event, "type", None) == "content_block_stop" and current_id and current_name:
                    try:
                        inp = json.loads(current_json) if current_json else {}
                        for t in tool_uses:
                            if t["id"] == current_id:
                                t["input"] = inp
                                break
                        send({"type": "tool_use", "id": current_id, "name": current_name, "input": inp})
                    except Exception:
                        pass
                    current_id = current_name = None

        message = stream.get_final_message()
        usage = None
        if getattr(message, "usage", None):
            usage = {"input_tokens": message.usage.input_tokens or 0, "output_tokens": message.usage.output_tokens or 0}
        return {
            "toolUses": tool_uses,
            "assistantMessage": {"role": "assistant", "content": message.content},
            "usage": usage,
        }

def create_anthropic_adapter():
    return AnthropicAdapter()
