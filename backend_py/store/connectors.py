import json
import datetime
from pathlib import Path
try:
    from config import DATA_DIR
except ImportError:
    DATA_DIR = Path(__file__).resolve().parent.parent / "data"

CONNECTORS_FILE = DATA_DIR / "connectors.json"
SERVICES = ["notion", "google"]
CONNECTOR_DEFINITIONS = {
    "notion": {"name": "Notion", "description": "Search pages and databases, read content", "needsApiKey": True},
    "google": {"name": "Google", "description": "Calendar, Gmail, Drive (one sign-in for all)", "needsApiKey": False},
}

def _ensure_dir():
    CONNECTORS_FILE.parent.mkdir(parents=True, exist_ok=True)

def _read_connectors():
    try:
        with open(CONNECTORS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def _write_connectors(connectors):
    _ensure_dir()
    with open(CONNECTORS_FILE, "w", encoding="utf-8") as f:
        json.dump(connectors, f, indent=2)

def list_connectors(user_id):
    return [c for c in _read_connectors() if c.get("userId") == user_id]

def get_connector(user_id, service):
    for c in _read_connectors():
        if c.get("userId") == user_id and c.get("service") == service:
            return c
    return None

def set_connector(user_id, service, credentials):
    all_ = _read_connectors()
    conn = {
        "userId": user_id,
        "service": service,
        "credentials": credentials.strip(),
        "connectedAt": datetime.datetime.utcnow().isoformat() + "Z",
    }
    for i, c in enumerate(all_):
        if c.get("userId") == user_id and c.get("service") == service:
            all_[i] = conn
            _write_connectors(all_)
            return conn
    all_.append(conn)
    _write_connectors(all_)
    return conn

def remove_connector(user_id, service):
    all_ = _read_connectors()
    filtered = [c for c in all_ if not (c.get("userId") == user_id and c.get("service") == service)]
    if len(filtered) == len(all_):
        return False
    _write_connectors(filtered)
    return True
