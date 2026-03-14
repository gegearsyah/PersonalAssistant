# Demo checklist

Use this to verify the full flow for the Personal Assistant demo (signup → login → context → send message → Google → create event).

## 1. People can sign up

- Open the extension popup.
- If not signed in, you see **Sign in to your account**.
- Enter **Backend URL** (e.g. `http://localhost:3000`), **Email**, **Password** (min 6 characters).
- Click **Create account**.
- You should see the chat view and your email in the header.

## 2. People can login

- Log out (click **Log out** in the header), or use a new profile.
- Enter Backend URL, email, password.
- Click **Sign in**.
- You should see the chat view and your email in the header.

## 3. Successfully extract HTML into markdown

- Open a few normal web pages (e.g. a news article) in other tabs.
- In the extension, leave **Include tab context** checked.
- Send any message (e.g. "What tabs do I have open?").
- The assistant should refer to content from your open tabs (titles, URLs, or content). Context is collected by the extension (HTML → markdown) and sent with the message.

## 4. Send message

- Type a message and click **Send** (or Enter).
- Ensure **Settings** has **LLM** configured: **Provider** (e.g. OpenAI or Groq), **LLM API Key**, **Model**.
- You should get a streamed reply from the chosen LLM (OpenAI/Groq/Claude).

## 5. Connect to Google

- Click **Connectors** in the header.
- Find **Google** (one sign-in for Calendar, Gmail, Drive) and click **Connect**.
- **Option A – OAuth (recommended):** Click **Sign in with Google** in the modal. A new tab opens; sign in with Google and allow access. You should see “Google connected” and can close the tab.
- **Option B – Manual:** Get a refresh token from [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) (use Calendar API v3 scope `https://www.googleapis.com/auth/calendar`), then paste the **Refresh token** in the modal and click **Connect**.
- Backend must have `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` (e.g. `http://localhost:3000/auth/google/callback`) in `.env` for OAuth.

## 6. Successfully create a calendar event

- With Google connected, send a message like: **“Create a calendar event tomorrow at 2pm called Team standup, 30 minutes.”**
- The assistant should use the `create_calendar_event` tool and confirm the event was created (and optionally show a link).
- Check [Google Calendar](https://calendar.google.com) to see the new event.

---

## Backend setup for the demo

1. Copy `backend/.env.example` to `backend/.env`.
2. Set at least:
   - `BACKEND_API_KEY` (any secret string; optional if you only use sign-in).
   - `JWT_SECRET` (e.g. `openssl rand -hex 32`).
   - Your LLM key is set **in the extension** (Settings → LLM API Key), not in the backend.
3. For Google OAuth, set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback`
4. Run: `cd backend && npm install && npm run dev`.
5. Load the extension from the `extension` folder in Chrome and use the popup for sign-up, sign-in, connectors, and chat.
