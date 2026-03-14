import json
from datetime import datetime
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, PORT, CALENDAR_TIMEZONE

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/documents",
]
DEFAULT_DURATION_SEC = 3600

def get_auth_url(state: str) -> tuple[str, str]:
    """Returns (authorization_url, code_verifier). Caller must store code_verifier by state for the callback."""
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_REDIRECT_URI or f"http://localhost:{PORT}/auth/google/callback"],
            }
        },
        scopes=SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI or f"http://localhost:{PORT}/auth/google/callback",
    )
    flow.redirect_uri = GOOGLE_REDIRECT_URI or f"http://localhost:{PORT}/auth/google/callback"
    url, _ = flow.authorization_url(access_type="offline", prompt="consent", state=state)
    code_verifier = getattr(flow, "code_verifier", None) or ""
    return (url, code_verifier)

def _get_calendar_client(credentials_json: str):
    cred = json.loads(credentials_json)
    refresh_token = cred.get("refresh_token")
    if not refresh_token:
        raise ValueError("Missing refresh_token")
    creds = Credentials(token=None, refresh_token=refresh_token, token_uri="https://oauth2.googleapis.com/token", client_id=GOOGLE_CLIENT_ID, client_secret=GOOGLE_CLIENT_SECRET, scopes=SCOPES)
    return build("calendar", "v3", credentials=creds)

def _to_local_iso(d: datetime, time_zone: str) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%S")

def _normalize_event_times(start_time: str, end_time: str, time_zone: str) -> tuple:
    start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    if end <= start:
        from datetime import timedelta
        end = start + timedelta(seconds=DEFAULT_DURATION_SEC)
    return (_to_local_iso(start, time_zone), _to_local_iso(end, time_zone))

def create_calendar_event(credentials_json: str, summary: str, start_time: str, end_time: str, description: str | None = None) -> str:
    cal = _get_calendar_client(credentials_json)
    start_dt, end_dt = _normalize_event_times(start_time, end_time, CALENDAR_TIMEZONE)
    body = {
        "summary": summary,
        "start": {"dateTime": start_dt, "timeZone": CALENDAR_TIMEZONE},
        "end": {"dateTime": end_dt, "timeZone": CALENDAR_TIMEZONE},
    }
    if description:
        body["description"] = description
    event = cal.events().insert(calendarId="primary", body=body).execute()
    eid = event.get("id", "")
    link = event.get("htmlLink", "")
    return f'Event created: "{summary}". ID: {eid}. View: {link}' if link else f'Event created: "{summary}". ID: {eid}.'

def list_calendar_events(credentials_json: str, max_results: int = 10) -> str:
    cal = _get_calendar_client(credentials_json)
    now = datetime.utcnow().isoformat() + "Z"
    events = cal.events().list(calendarId="primary", timeMin=now, maxResults=max_results, singleEvents=True, orderBy="startTime").execute()
    items = events.get("items", [])
    if not items:
        return "No upcoming events."
    lines = []
    for e in items:
        start = e.get("start", {}) or {}
        start_str = start.get("dateTime") or start.get("date") or "?"
        lines.append(f"- {e.get('summary', '(no title)')} ({start_str})")
    return "Upcoming events:\n" + "\n".join(lines)
