"""MCP client: built-in tools (echo, add, Google Calendar, Google Docs) + external MCP servers."""
from store.connectors import get_connector
from google_calendar import create_calendar_event, list_calendar_events
from google_docs import create_google_doc

try:
    from external_mcp import list_external_tools, call_external_tool, has_external_tool
except ImportError:
    def list_external_tools(user_id): return []
    def call_external_tool(user_id, name, args): return f"Tool {name} not available."
    def has_external_tool(user_id, name): return False

CALENDAR_TOOLS = [
    {"name": "create_calendar_event", "description": "Create a new event on the user's Google Calendar. Pass start and end in ISO 8601 UTC.", "inputSchema": {"type": "object", "properties": {"summary": {"type": "string"}, "startTime": {"type": "string"}, "endTime": {"type": "string"}, "description": {"type": "string"}}, "required": ["summary", "startTime", "endTime"]}},
    {"name": "list_calendar_events", "description": "List upcoming events from the user's Google Calendar.", "inputSchema": {"type": "object", "properties": {"maxResults": {"type": "number"}}}},
    {"name": "create_google_doc", "description": "Create a new Google Doc with the given title and body content.", "inputSchema": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}}, "required": ["title", "content"]}},
]
MOCK_TOOLS = [
    {"name": "echo", "description": "Echo back the message", "inputSchema": {"type": "object", "properties": {"message": {"type": "string"}}}},
    {"name": "add", "description": "Add two numbers", "inputSchema": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}}},
]

def create_mcp_client(user_id: str | None):
    if not user_id:
        return UserMcpClient("", None)
    conn = get_connector(user_id, "google")
    creds = conn.get("credentials") if conn else None
    return UserMcpClient(user_id, creds)

class UserMcpClient:
    def __init__(self, user_id: str, calendar_credentials: str | None):
        self.user_id = user_id
        self.calendar_credentials = calendar_credentials

    def list_tools(self) -> list[dict]:
        tools = list(MOCK_TOOLS)
        if self.calendar_credentials:
            tools = tools + list(CALENDAR_TOOLS)
        built_in_names = {t["name"] for t in tools}
        for t in list_external_tools(self.user_id):
            if t.get("name") not in built_in_names:
                tools.append(t)
                built_in_names.add(t.get("name"))
        return tools

    def call_tool(self, name: str, args: dict) -> str:
        if name == "echo":
            return str(args.get("message", ""))
        if name == "add":
            return str(float(args.get("a", 0)) + float(args.get("b", 0)))
        if name == "create_calendar_event" and self.calendar_credentials:
            summary = str(args.get("summary", ""))
            start_time = str(args.get("startTime", ""))
            end_time = str(args.get("endTime", ""))
            desc = args.get("description")
            if not summary or not start_time or not end_time:
                return "Error: summary, startTime, and endTime are required."
            try:
                return create_calendar_event(self.calendar_credentials, summary, start_time, end_time, desc)
            except Exception as e:
                return f"Error creating event: {e}"
        if name == "list_calendar_events" and self.calendar_credentials:
            try:
                return list_calendar_events(self.calendar_credentials, int(args.get("maxResults", 10)))
            except Exception as e:
                return f"Error listing events: {e}"
        if name == "create_google_doc" and self.calendar_credentials:
            title = str(args.get("title", "")).strip()
            content = str(args.get("content", "")).strip()
            if not title or not content:
                return "Error: title and content are required for create_google_doc."
            try:
                return create_google_doc(self.calendar_credentials, title, content)
            except Exception as e:
                return f"Error creating document: {e}"
        if has_external_tool(self.user_id, name):
            return call_external_tool(self.user_id, name, args)
        return f'Tool "{name}" is not available. Connect Google or add external MCP servers.'
