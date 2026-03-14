"""Minimal MCP stdio client: subprocess + JSON-RPC. No external mcp package required."""
import json
import subprocess
import threading
import queue
import os

_cache_by_user = {}

def _run_server_process(command: str, args: list, env: dict | None) -> subprocess.Popen:
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    return subprocess.Popen(
        [command] + (args or []),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=full_env,
        text=True,
        bufsize=1,
    )

def _read_json_line(proc: subprocess.Popen) -> dict | None:
    line = proc.stdout.readline()
    if not line:
        return None
    line = line.strip()
    if not line:
        return _read_json_line(proc)
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None

def _write_json(proc: subprocess.Popen, obj: dict):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()

def _connect_server(server_config: dict) -> dict | None:
    """Connect to one MCP server. Returns {tools: [...], proc: Popen} or None."""
    command = server_config.get("command", "")
    args = server_config.get("args") or []
    env = server_config.get("env") or {}
    if not command:
        return None
    try:
        proc = _run_server_process(command, args, env)
        # Initialize
        _write_json(proc, {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "personal-assistant-backend", "version": "1.0.0"},
            },
        })
        init_resp = _read_json_line(proc)
        if not init_resp or "result" not in init_resp:
            proc.terminate()
            return None
        _write_json(proc, {"jsonrpc": "2.0", "id": 2, "method": "notifications/initialized"})
        # tools/list
        _write_json(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": {}})
        list_resp = _read_json_line(proc)
        if not list_resp or "result" not in list_resp:
            proc.terminate()
            return None
        tools = list_resp.get("result", {}).get("tools") or []
        return {"proc": proc, "tools": tools, "server_id": server_config.get("id", "unknown")}
    except Exception as e:
        print(f"[MCP] Failed to connect to {server_config.get('id', '?')}: {e}")
        return None

def ensure_connected(user_id: str):
    if user_id in _cache_by_user:
        return
    try:
        from store.mcp_servers import get_mcp_servers_config_for_user
        configs = get_mcp_servers_config_for_user(user_id)
    except Exception:
        configs = []
    servers = []
    tool_to_server = {}
    for cfg in configs:
        conn = _connect_server(cfg)
        if conn:
            servers.append(conn)
            for t in conn["tools"]:
                name = t.get("name")
                if name and name not in tool_to_server:
                    tool_to_server[name] = conn
    _cache_by_user[user_id] = {"servers": servers, "tool_to_server": tool_to_server}

def get_tools_from_cache(user_id: str) -> list[dict]:
    ensure_connected(user_id)
    entry = _cache_by_user.get(user_id, {})
    tool_to_server = entry.get("tool_to_server") or {}
    result = []
    seen = set()
    for name, conn in tool_to_server.items():
        if name in seen:
            continue
        seen.add(name)
        for t in conn.get("tools") or []:
            if t.get("name") == name:
                result.append({
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "inputSchema": t.get("inputSchema", {"type": "object", "properties": {}}),
                })
                break
    return result

def call_tool_impl(user_id: str, name: str, args: dict) -> str:
    ensure_connected(user_id)
    entry = _cache_by_user.get(user_id, {})
    tool_to_server = entry.get("tool_to_server") or {}
    conn = tool_to_server.get(name)
    if not conn:
        return f'Tool "{name}" is not provided by any connected external MCP server.'
    proc = conn.get("proc")
    if not proc or proc.poll() is not None:
        return f"Server for {name} is not running."
    try:
        req_id = hash((user_id, name)) % 100000 + 100
        _write_json(proc, {"jsonrpc": "2.0", "id": req_id, "method": "tools/call", "params": {"name": name, "arguments": args or {}}})
        resp = _read_json_line(proc)
        if not resp:
            return "No response from MCP server."
        result = resp.get("result")
        if result is None and "error" in resp:
            return resp["error"].get("message", str(resp["error"]))
        content = (result or {}).get("content") or []
        texts = [c.get("text", "") for c in content if c.get("type") == "text"]
        return "\n".join(texts) if texts else json.dumps(result)
    except Exception as e:
        return f"Error calling {name}: {e}"
