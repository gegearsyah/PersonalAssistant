import json
import hashlib
import secrets
import time
import datetime
from pathlib import Path

# Import when used from backend_py as cwd
try:
    from config import DATA_DIR
except ImportError:
    DATA_DIR = Path(__file__).resolve().parent.parent / "data"

USERS_FILE = DATA_DIR / "users.json"

def _ensure_dir():
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)

def _read_users():
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def _write_users(users):
    _ensure_dir()
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)

def _hash_password(password):
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}:{h.hex()}"

def _verify_password(password, stored):
    parts = stored.split(":", 1)
    if len(parts) != 2:
        return False
    salt, hash_hex = parts
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return secrets.compare_digest(h.hex(), hash_hex)

def find_user_by_email(email):
    users = _read_users()
    normalized = email.strip().lower()
    for u in users:
        if u.get("email") == normalized:
            return u
    return None

def find_user_by_id(uid):
    users = _read_users()
    for u in users:
        if u.get("id") == uid:
            return u
    return None

def create_user(email, password):
    normalized = email.strip().lower()
    if not normalized or len(password) < 6:
        raise ValueError("Email and password (min 6 characters) required")
    users = _read_users()
    if any(u.get("email") == normalized for u in users):
        raise ValueError("Email already registered")
    user_id = hashlib.sha256(f"{normalized}{time.time()}".encode()).hexdigest()[:24]
    user = {
        "id": user_id,
        "email": normalized,
        "passwordHash": _hash_password(password),
        "createdAt": datetime.datetime.utcnow().isoformat() + "Z",
    }
    users.append(user)
    _write_users(users)
    return user

def verify_user(email, password):
    user = find_user_by_email(email)
    if not user or not _verify_password(password, user.get("passwordHash", "")):
        return None
    return user
