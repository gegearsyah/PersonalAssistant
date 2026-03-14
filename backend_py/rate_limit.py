import time
from collections import defaultdict

WINDOW_MS = 60_000
store = defaultdict(list)

def prune(key, now):
    cutoff = now - WINDOW_MS
    store[key] = [t for t in store[key] if t > cutoff]
    if not store[key]:
        del store[key]

def check_rate_limit(key: str, limit: int) -> dict:
    now = time.time() * 1000
    prune(key, now)
    timestamps = store[key]
    if len(timestamps) >= limit:
        oldest = min(timestamps)
        retry_after = max(0, int((oldest + WINDOW_MS - now) / 1000))
        return {"allowed": False, "retryAfter": retry_after}
    timestamps.append(now)
    return {"allowed": True}
