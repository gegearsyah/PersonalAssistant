import json
from pathlib import Path
try:
    from config import DATA_DIR, get_mcp_servers_config
except ImportError:
    DATA_DIR = Path(__file__).resolve().parent.parent / "data"
    def get_mcp_servers_config():
        import json
        raw = __import__("os").environ.get("MCP_SERVERS_JSON", "").strip()
        if not raw:
            return []
        try:
            arr = json.loads(raw)
            return [s for s in arr if isinstance(s, dict) and isinstance(s.get("id"), str) and isinstance(s.get("command"), str)]
        except Exception:
            return []

MCP_SERVERS_FILE = DATA_DIR / "mcp-servers.json"

def _ensure_dir():
    MCP_SERVERS_FILE.parent.mkdir(parents=True, exist_ok=True)

def _read_all() -> dict:
    try:
        with open(MCP_SERVERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _write_all(stored: dict):
    _ensure_dir()
    with open(MCP_SERVERS_FILE, "w", encoding="utf-8") as f:
        json.dump(stored, f, indent=2)

def _valid(s: dict) -> bool:
    return isinstance(s.get("id"), str) and isinstance(s.get("command"), str)

def get_user_mcp_servers(user_id: str) -> list[dict]:
    stored = _read_all()
    raw = stored.get(user_id)
    if not isinstance(raw, list):
        return []
    return [s for s in raw if _valid(s)]

def set_user_mcp_servers(user_id: str, servers: list[dict]) -> list[dict]:
    list_ = [s for s in servers if _valid(s)]
    stored = _read_all()
    stored[user_id] = list_
    _write_all(stored)
    return list_

def get_mcp_servers_config_for_user(user_id: str) -> list[dict]:
    from_store = get_user_mcp_servers(user_id)
    if from_store:
        return from_store
    return get_mcp_servers_config()
