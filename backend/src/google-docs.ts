import { google } from 'googleapis';
import { config } from './config.js';

function getOAuth2Client() {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Google');
  }
  const redirectUri = config.googleRedirectUri || `http://localhost:${config.port}/auth/google/callback`;
  return new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, redirectUri);
}

export async function createGoogleDoc(
  credentialsJson: string,
  title: string,
  content: string
): Promise<string> {
  let cred: { refresh_token: string };
  try {
    cred = JSON.parse(credentialsJson) as { refresh_token: string };
  } catch {
    throw new Error('Invalid Google credentials');
  }
  if (!cred.refresh_token) throw new Error('Missing refresh_token');
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: cred.refresh_token });
  const docs = google.docs({ version: 'v1', auth: oauth2 });

  const createRes = await docs.documents.create({
    requestBody: { title: title || 'Untitled' },
  });
  const documentId = createRes.data.documentId;
  if (!documentId) throw new Error('Failed to create document');

  if (content && content.trim()) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content.trim(),
            },
          },
        ],
      },
    });
  }

  const link = `https://docs.google.com/document/d/${documentId}/edit`;
  return `Document created: "${title}". View: ${link}`;
}
