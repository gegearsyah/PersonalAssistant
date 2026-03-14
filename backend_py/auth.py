import jwt
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from config import JWT_SECRET, BACKEND_API_KEY
from store.users import find_user_by_id

security_bearer = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def create_token(user_id: str, email: str, expires_days: int = 7) -> str:
    payload = jwt.encode(
        {"userId": user_id, "email": email},
        JWT_SECRET,
        algorithm="HS256",
    )
    return payload if isinstance(payload, str) else payload.decode()

def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None

async def resolve_auth(request: Request) -> tuple[str, dict | None]:
    """Returns (token_for_rate_limit, user_dict or None)."""
    auth: HTTPAuthorizationCredentials | None = await security_bearer(request)
    api_key = await api_key_header(request)
    token = (auth.credentials if auth else "").strip()
    if token:
        decoded = decode_token(token)
        if decoded:
            user = find_user_by_id(decoded.get("userId", ""))
            if user:
                return (token[:32], {"id": user["id"], "email": user["email"]})
    if api_key and BACKEND_API_KEY and api_key == BACKEND_API_KEY:
        return (api_key, None)
    return ("", None)

async def require_auth(request: Request) -> tuple[str, dict | None]:
    token, user = await resolve_auth(request)
    if not token:
        raise HTTPException(status_code=401, detail={"error": "unauthorized", "message": "Sign in or provide a valid API key"})
    return (token, user)

async def require_user(request: Request) -> dict:
    token, user = await resolve_auth(request)
    if not user:
        raise HTTPException(status_code=401, detail={"error": "unauthorized", "message": "Sign in required"})
    return user
