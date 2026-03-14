import os
import json
from pathlib import Path

def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()

DATA_DIR = Path(_env("DATA_DIR", "./data"))
PORT = int(_env("PORT", "3000"))
JWT_SECRET = _env("JWT_SECRET", "change-me-in-production")
BACKEND_API_KEY = _env("BACKEND_API_KEY", "")
ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in _env("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
MAX_MESSAGE_LENGTH = 32_000
RATE_LIMIT_REQUESTS_PER_MINUTE = 60
CLAUDE_MODEL = _env("CLAUDE_MODEL", "claude-sonnet-4-20250514")
MAX_TOOL_TURNS = 5
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = _env("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = _env("GOOGLE_REDIRECT_URI", "")
CALENDAR_TIMEZONE = _env("CALENDAR_TIMEZONE", "Asia/Jakarta")
MCP_SERVERS_JSON = _env("MCP_SERVERS_JSON", "")

def get_mcp_servers_config() -> list:
    raw = MCP_SERVERS_JSON.strip()
    if not raw:
        return []
    try:
        arr = json.loads(raw)
        if not isinstance(arr, list):
            return []
        return [
            s for s in arr
            if isinstance(s, dict)
            and isinstance(s.get("id"), str)
            and isinstance(s.get("command"), str)
        ]
    except json.JSONDecodeError:
        return []
