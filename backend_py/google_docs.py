import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from google_calendar import SCOPES

def create_google_doc(credentials_json: str, title: str, content: str) -> str:
    cred = json.loads(credentials_json)
    refresh_token = cred.get("refresh_token")
    if not refresh_token:
        raise ValueError("Missing refresh_token")
    creds = Credentials(token=None, refresh_token=refresh_token, token_uri="https://oauth2.googleapis.com/token", client_id=GOOGLE_CLIENT_ID, client_secret=GOOGLE_CLIENT_SECRET, scopes=SCOPES)
    docs = build("docs", "v1", credentials=creds)
    create_res = docs.documents().create(body={"title": title or "Untitled"}).execute()
    document_id = create_res.get("documentId")
    if not document_id:
        raise ValueError("Failed to create document")
    if content and content.strip():
        docs.documents().batchUpdate(documentId=document_id, body={
            "requests": [{"insertText": {"location": {"index": 1}, "text": content.strip()}}]
        }).execute()
    return f'Document created: "{title}". View: https://docs.google.com/document/d/{document_id}/edit'
