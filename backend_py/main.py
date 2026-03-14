import os
import json
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse, HTMLResponse
from pydantic import BaseModel
import uvicorn

from config import PORT, ALLOWED_ORIGINS, MAX_MESSAGE_LENGTH, BACKEND_API_KEY, ANTHROPIC_API_KEY
from auth import create_token, decode_token, resolve_auth, require_user, api_key_header
from rate_limit import check_rate_limit
from store.users import find_user_by_id, create_user, verify_user
from store.connectors import list_connectors, set_connector, remove_connector, CONNECTOR_DEFINITIONS, SERVICES
from store.mcp_servers import get_user_mcp_servers, set_user_mcp_servers, get_mcp_servers_config_for_user
from mcp import create_mcp_client
from orchestrator import run_chat_stream, clear_chat_history
from llm import get_adapter, DEFAULT_MODELS
from google_calendar import get_auth_url

# Optional: Google callback
try:
    from google_calendar import SCOPES
    from google_auth_oauthlib.flow import Flow
    from store.connectors import set_connector as _set_connector
    from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
    GOOGLE_CONFIGURED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
except Exception:
    GOOGLE_CONFIGURED = False

app = FastAPI(title="Personal Assistant Backend")

# CORS: WebSocket from chrome-extension often gets 403 with allow_credentials=True + wildcard.
# Use explicit origins + regex so extension and localhost are allowed; credentials True for cookies if needed.
_origins = [o.strip() for o in ALLOWED_ORIGINS if o and isinstance(o, str) and "*" not in o.strip()]
if not _origins:
    _origins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"chrome-extension://.*|https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

def validate_legacy_api_key(token: str) -> bool:
    return bool(BACKEND_API_KEY and token == BACKEND_API_KEY)

# ----- Auth -----
class RegisterBody(BaseModel):
    email: str | None = None
    password: str | None = None

class LoginBody(BaseModel):
    email: str | None = None
    password: str | None = None

@app.post("/auth/register")
def auth_register(body: RegisterBody):
    if not body.email or not body.password:
        raise HTTPException(400, detail={"error": "bad_request", "message": "Email and password required"})
    try:
        user = create_user(body.email, body.password)
        token = create_token(user["id"], user["email"])
        return {"token": token, "user": {"id": user["id"], "email": user["email"]}}
    except ValueError as e:
        raise HTTPException(400, detail={"error": "bad_request", "message": str(e)})

@app.post("/auth/login")
def auth_login(body: LoginBody):
    if not body.email or not body.password:
        raise HTTPException(400, detail={"error": "bad_request", "message": "Email and password required"})
    user = verify_user(body.email, body.password)
    if not user:
        raise HTTPException(401, detail={"error": "unauthorized", "message": "Invalid email or password"})
    token = create_token(user["id"], user["email"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"]}}

# ----- Users me -----
@app.get("/users/me")
async def users_me(request: Request):
    _, user = await resolve_auth(request)
    if not user:
        raise HTTPException(401, detail={"error": "unauthorized", "message": "Sign in required"})
    return {"user": user}

# ----- Connectors -----
@app.get("/users/me/connectors")
async def get_connectors(request: Request):
    user = await require_user(request)
    conns = list_connectors(user["id"])
    all_services = [{"service": s, "name": CONNECTOR_DEFINITIONS[s]["name"], "description": CONNECTOR_DEFINITIONS[s]["description"], "needsApiKey": CONNECTOR_DEFINITIONS[s]["needsApiKey"], "connected": any(c["service"] == s for c in conns), "connectedAt": next((c["connectedAt"] for c in conns if c["service"] == s), None)} for s in SERVICES]
    return {"connectors": all_services}

class ConnectorBody(BaseModel):
    service: str | None = None
    api_key: str | None = None
    refresh_token: str | None = None

@app.post("/users/me/connectors")
async def post_connector(request: Request, body: ConnectorBody):
    user = await require_user(request)
    if not body.service or body.service not in SERVICES:
        raise HTTPException(400, detail={"error": "bad_request", "message": "Valid service required: notion, google"})
    if body.service == "google":
        rt = (body.refresh_token or "").strip()
        if not rt:
            raise HTTPException(400, detail={"error": "bad_request", "message": "refresh_token required for Google"})
        cred = json.dumps({"refresh_token": rt})
    else:
        cred = (body.api_key or "").strip()
        if not cred:
            raise HTTPException(400, detail={"error": "bad_request", "message": "api_key required"})
    set_connector(user["id"], body.service, cred)
    return {"ok": True, "service": body.service, "message": "Connected"}

@app.delete("/users/me/connectors/{service}")
async def delete_connector(request: Request, service: str):
    user = await require_user(request)
    if service not in SERVICES:
        raise HTTPException(400, detail={"error": "bad_request", "message": "Valid service required"})
    if not remove_connector(user["id"], service):
        raise HTTPException(404, detail={"error": "not_found", "message": "Connector not found"})
    return {"ok": True, "message": "Disconnected"}

# PKCE code_verifier stored by state for Google OAuth callback
_oauth_state_to_verifier = {}

# ----- Google OAuth -----
@app.get("/auth/google")
async def auth_google(request: Request, token: str | None = None):
    if not GOOGLE_CONFIGURED:
        return HTMLResponse("<h1>Google OAuth not configured</h1><p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend .env.</p>", status_code=503)
    if not token:
        raise HTTPException(400, detail="Missing token")
    decoded = decode_token(token)
    if not decoded:
        raise HTTPException(401, detail="Invalid or expired token")
    user = find_user_by_id(decoded.get("userId", ""))
    if not user:
        raise HTTPException(401, detail="Invalid token")
    import base64
    state = base64.urlsafe_b64encode(user["id"].encode()).decode()
    url, code_verifier = get_auth_url(state)
    _oauth_state_to_verifier[state] = code_verifier
    return RedirectResponse(url, status_code=302)

@app.get("/auth/google/callback")
async def auth_google_callback(code: str | None = None, state: str | None = None):
    if not GOOGLE_CONFIGURED or not code or not state:
        return HTMLResponse("<h1>Missing code or state</h1>", status_code=400)
    import base64
    try:
        user_id = base64.urlsafe_b64decode(state).decode()
    except Exception:
        return HTMLResponse("<h1>Invalid state</h1>", status_code=400)
    code_verifier = _oauth_state_to_verifier.pop(state, None)
    if not code_verifier:
        return HTMLResponse("<h1>Invalid or expired state</h1><p>Try connecting Google again from the extension.</p>", status_code=400)
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI or f"http://localhost:{PORT}/auth/google/callback"],
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI or f"http://localhost:{PORT}/auth/google/callback",
        code_verifier=code_verifier,
        autogenerate_code_verifier=False,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        return HTMLResponse("<h1>No refresh token</h1>", status_code=400)
    _set_connector(user_id, "google", json.dumps({"refresh_token": creds.refresh_token}))
    return HTMLResponse("<!DOCTYPE html><html><head><title>Connected</title></head><body><h1>Google connected</h1><p>You can close this tab and return to the extension.</p></body></html>")

# ----- MCP registry & config -----
@app.get("/api/mcp-servers/config")
async def get_mcp_config(request: Request):
    user = await require_user(request)
    servers = get_user_mcp_servers(user["id"])
    return {"servers": servers}

class McpConfigBody(BaseModel):
    servers: list[dict] | None = None

@app.put("/api/mcp-servers/config")
async def put_mcp_config(request: Request, body: McpConfigBody):
    user = await require_user(request)
    raw = body.servers or []
    list_ = [s for s in raw if isinstance(s, dict) and isinstance(s.get("id"), str) and isinstance(s.get("command"), str)]
    set_user_mcp_servers(user["id"], list_)
    return {"ok": True, "servers": list_}

@app.get("/api/mcp-servers")
async def get_mcp_servers(search: str | None = None, limit: int = 30, cursor: str | None = None):
    import httpx
    params = {"limit": min(100, max(1, limit))}
    if cursor:
        params["cursor"] = cursor
    async with httpx.AsyncClient() as client:
        r = await client.get("https://registry.modelcontextprotocol.io/v0.1/servers", params=params)
        r.raise_for_status()
        data = r.json()
    servers = data.get("servers") or []
    if search:
        q = search.strip().lower()
        servers = [s for s in servers if q in (s.get("server") or {}).get("name", "").lower() or q in (s.get("server") or {}).get("title", "").lower() or q in (s.get("server") or {}).get("description", "").lower()]
    return {"servers": servers, "metadata": data.get("metadata", {})}

# ----- Health -----
@app.get("/health")
def health():
    return {"status": "ok"}

# ----- Chat SSE -----
class ChatBody(BaseModel):
    message: str | None = None
    context: dict | None = None
    allow_tools: bool = True
    provider: str | None = None
    api_key: str | None = None
    model: str | None = None

async def chat_sse_stream(request: Request, body: ChatBody):
    import asyncio
    token, user = await resolve_auth(request)
    if not token:
        yield f"event: error\ndata: {json.dumps({'type': 'error', 'code': 'unauthorized', 'message': 'Sign in or provide a valid API key'})}\n\n"
        return
    if not body.message or len(body.message) > MAX_MESSAGE_LENGTH:
        yield f"event: error\ndata: {json.dumps({'type': 'error', 'code': 'bad_request', 'message': 'Missing or invalid message'})}\n\n"
        return
    rl = check_rate_limit(token, 60)
    if not rl.get("allowed"):
        yield f"event: error\ndata: {json.dumps({'type': 'error', 'code': 'rate_limited', 'message': 'Too many requests'})}\n\n"
        return
    mcp_client = create_mcp_client(user["id"] if user else None)
    provider = body.provider or "claude"
    api_key = (body.api_key or "").strip() or ANTHROPIC_API_KEY
    model = (body.model or "").strip() or DEFAULT_MODELS.get(provider, "")
    llm_options = {"provider": provider, "api_key": api_key, "model": model}
    queue = asyncio.Queue()
    def send(msg):
        try:
            queue.put_nowait(msg)
        except Exception:
            pass
    loop = asyncio.get_event_loop()
    def run_sync():
        run_chat_stream(body.message, body.context, body.allow_tools, mcp_client, send, llm_options)
        queue.put_nowait(None)
    task = loop.run_in_executor(None, run_sync)
    while True:
        m = await queue.get()
        if m is None:
            break
        event = m.get("type", "error")
        yield f"event: {event}\ndata: {json.dumps(m)}\n\n"
    await task

@app.post("/v1/chat")
async def v1_chat(request: Request, body: ChatBody):
    return StreamingResponse(chat_sse_stream(request, body), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


# ----- Chat history management -----
@app.post("/v1/clear-chat")
async def v1_clear_chat(request: Request):
    # Require valid auth (same as /users/me)
    _, user = await resolve_auth(request)
    if not user:
        raise HTTPException(401, detail={"error": "unauthorized", "message": "Sign in required"})
    clear_chat_history()
    return {"ok": True}


# ----- WebSocket -----
def _ws_verify_token(token: str) -> tuple[bool, str | None]:
    """Verify token; return (ok, user_id or None)."""
    if not (token and token.strip()):
        return False, None
    if validate_legacy_api_key(token):
        return True, None
    decoded = decode_token(token)
    if decoded:
        return True, decoded.get("userId")
    return False, None

@app.websocket("/ws")
async def websocket_endpoint(websocket):
    # Validate token BEFORE accept; use HTTP 401 denial instead of websocket.close (403)
    token = (websocket.query_params.get("token") or "").strip()
    ok, user_id = _ws_verify_token(token)
    if not ok:
        from starlette.responses import Response
        await websocket.send_denial_response(Response(status_code=401, content=b"Unauthorized"))
        return
    await websocket.accept()
    user_id = user_id or (decode_token(token) or {}).get("userId") if token else None
    _uid = user_id  # mutable ref for auth re-login

    def send(msg):
        import asyncio
        asyncio.create_task(websocket.send_json(msg))
    await websocket.send_json({"type": "auth_ok"})
    while True:
        try:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
        except Exception:
            break
        if msg.get("type") == "auth":
            auth_ok, auth_uid = _ws_verify_token(msg.get("token", "") or "")
            if auth_ok:
                if auth_uid:
                    _uid = auth_uid
                await websocket.send_json({"type": "auth_ok"})
            else:
                await websocket.send_json({"type": "error", "code": "unauthorized", "message": "Invalid token"})
                await websocket.close()
            continue
        if msg.get("type") == "ping":
            await websocket.send_json({"type": "pong"})
            continue
        if msg.get("type") == "chat":
            rl = check_rate_limit(token or "anon", 60)
            if not rl.get("allowed"):
                await websocket.send_json({"type": "error", "code": "rate_limited", "message": "Too many requests"})
                continue
            message = msg.get("message") or ""
            if len(message) > MAX_MESSAGE_LENGTH:
                await websocket.send_json({"type": "error", "code": "bad_request", "message": "Message too long"})
                continue
            mcp_client = create_mcp_client(_uid)
            provider = msg.get("provider") or "claude"
            api_key = (msg.get("api_key") or "").strip() or ANTHROPIC_API_KEY
            model = (msg.get("model") or "").strip() or DEFAULT_MODELS.get(provider, "")
            llm_options = {"provider": provider, "api_key": api_key, "model": model}
            import asyncio
            ws_queue = asyncio.Queue()
            def ws_send(m):
                ws_queue.put_nowait(m)
            loop = asyncio.get_event_loop()
            def ws_run():
                run_chat_stream(message, msg.get("context"), msg.get("allow_tools", True), mcp_client, ws_send, llm_options)
                ws_queue.put_nowait(None)
            exec_task = loop.run_in_executor(None, ws_run)
            while True:
                m = await ws_queue.get()
                if m is None:
                    break
                await websocket.send_json(m)
            await exec_task
    await websocket.close()

if __name__ == "__main__":
    if not ANTHROPIC_API_KEY:
        print("ANTHROPIC_API_KEY is not set; Claude will need per-request api_key from extension.")
    if not BACKEND_API_KEY:
        print("BACKEND_API_KEY is not set; use sign-in (JWT) in the extension for WebSocket auth.")
    print(f"Server listening on http://0.0.0.0:{PORT}; WebSocket at ws://localhost:{PORT}/ws")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
