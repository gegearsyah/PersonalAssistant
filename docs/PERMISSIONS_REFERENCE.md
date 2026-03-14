# Extension Permissions Reference

Quick reference for Chrome extension permissions used by the Personal Assistant. See **ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md** §11 for full manifest and rationale.

## Required permissions

| Permission | Use |
|------------|-----|
| `tabs` | Enumerate and query open tabs (URL, title, tabId) for context collection. |
| `scripting` | Inject scripts into tabs to extract page content (Manifest V3 replacement for `tabs.executeScript`). |
| `activeTab` | Access the active tab when user invokes the extension (e.g. current-tab-only mode) without requesting `<all_urls>` up front. |
| `storage` | Persist backend URL, API token, and user preferences in `chrome.storage.local`. |

## Optional permissions

| Permission | Use |
|------------|-----|
| `history` | List recently closed tabs via `chrome.history.search()` for “closed tabs” context. Request at runtime with `chrome.permissions.request({ permissions: ['history'] })` so install does not require history access. |

## Host permissions

| Value | Use |
|-------|-----|
| `<all_urls>` | Required to inject scripts into arbitrary tab origins for content extraction. If you only support “current tab only,” you can start with no host permissions and rely on `activeTab` when the user clicks the action on that tab. |

## Content scripts vs inject-on-demand

- **manifest `content_scripts`:** Runs in every matching tab automatically. Not required for this design if you inject only when the user triggers “Collect context” (via `chrome.scripting.executeScript` from the service worker).
- **Inject on demand:** Prefer injecting a single `extract.js` (or inline function) when collecting context to avoid loading script in every tab.

## Icon placeholders

The manifest references `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`. Provide real assets or placeholder PNGs so the extension loads without errors.
