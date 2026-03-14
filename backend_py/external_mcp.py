"""External MCP servers (stdio). Optional: install mcp package for full support."""

_cache = {}

def list_external_tools(user_id: str) -> list[dict]:
    try:
        from store.mcp_servers import get_mcp_servers_config_for_user
        from _mcp_stdio import ensure_connected, get_tools_from_cache
        ensure_connected(user_id)
        return get_tools_from_cache(user_id)
    except ImportError:
        return []

def call_external_tool(user_id: str, name: str, args: dict) -> str:
    try:
        from _mcp_stdio import ensure_connected, call_tool_impl
        ensure_connected(user_id)
        return call_tool_impl(user_id, name, args)
    except ImportError:
        return f"Tool {name} not available (MCP client not installed)."

def has_external_tool(user_id: str, name: str) -> bool:
    try:
        from _mcp_stdio import ensure_connected, get_tools_from_cache
        ensure_connected(user_id)
        tools = get_tools_from_cache(user_id)
        return any(t.get("name") == name for t in tools)
    except ImportError:
        return False
