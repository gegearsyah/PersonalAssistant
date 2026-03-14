import { google } from 'googleapis';
import { config } from './config.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getOAuth2Client() {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Google');
  }
  const redirectUri = config.googleRedirectUri || `http://localhost:${config.port}/auth/google/callback`;
  return new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, redirectUri);
}

export function getAuthUrl(state: string): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  });
}

export async function getCalendarClient(credentialsJson: string) {
  let cred: { refresh_token: string };
  try {
    cred = JSON.parse(credentialsJson) as { refresh_token: string };
  } catch {
    throw new Error('Invalid Google credentials');
  }
  if (!cred.refresh_token) throw new Error('Missing refresh_token');
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: cred.refresh_token });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  return calendar;
}

export async function createCalendarEvent(
  credentialsJson: string,
  summary: string,
  startTime: string,
  endTime: string,
  description?: string
): Promise<string> {
  const calendar = await getCalendarClient(credentialsJson);
  const event: { summary: string; description?: string; start: { dateTime: string; timeZone?: string }; end: { dateTime: string; timeZone?: string } } = {
    summary,
    start: { dateTime: startTime, timeZone: 'UTC' },
    end: { dateTime: endTime, timeZone: 'UTC' },
  };
  if (description) event.description = description;
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    const id = res.data.id;
    const link = res.data.htmlLink;
    return `Event created: "${summary}". ID: ${id}. ${link ? `View: ${link}` : ''}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message);
  }
}

export async function listCalendarEvents(credentialsJson: string, maxResults = 10): Promise<string> {
  const calendar = await getCalendarClient(credentialsJson);
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });
  const items = res.data.items || [];
  if (items.length === 0) return 'No upcoming events.';
  const lines = items.map((e) => {
    const start = e.start?.dateTime ?? e.start?.date ?? '?';
    return `- ${e.summary || '(no title)'} (${start})`;
  });
  return 'Upcoming events:\n' + lines.join('\n');
}
