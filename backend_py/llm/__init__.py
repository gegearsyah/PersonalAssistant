OPENAI_BASE = "https://api.openai.com/v1"
GROQ_BASE = "https://api.groq.com/openai/v1"
DEFAULT_MODELS = {"claude": "claude-sonnet-4-20250514", "openai": "gpt-4o-mini", "groq": "llama-3.3-70b-versatile"}

def get_adapter(provider: str):
    if provider == "claude":
        from llm.anthropic_adapter import create_anthropic_adapter
        return create_anthropic_adapter()
    if provider in ("openai", "groq"):
        from llm.openai_compat import create_openai_compat_adapter
        base = GROQ_BASE if provider == "groq" else OPENAI_BASE
        return create_openai_compat_adapter(base)
    raise ValueError(f"Unknown provider: {provider}")
