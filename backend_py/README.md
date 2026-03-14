# Personal Assistant Backend (FastAPI)

Python FastAPI backend with the same API as the Node backend so the Chrome extension works unchanged.

## Setup

```bash
cd backend_py
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

Copy `../backend/.env` to `backend_py/.env` or set env vars (see `../backend/.env.example`).

## Run

```bash
# From backend_py directory
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 3000
```

Server runs at `http://localhost:3000`. Use the same extension backend URL. Stop the Node backend first if it is running on port 3000, or set `PORT=3001` in `.env` to run both.

## Data

Uses the same file-based store as the Node backend. Set `DATA_DIR` to point to your existing `data/` (e.g. `DATA_DIR=../backend/data`) to share users, connectors, and MCP config.
