import { google } from 'googleapis';
import { config } from './config.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/documents',
];
const DEFAULT_DURATION_MS = 60 * 60 * 1000; // 1 hour if end <= start

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

/** Format a Date as local ISO in the given IANA timezone (e.g. Asia/Jakarta). */
function toLocalISO(d: Date, timeZone: string): string {
  const s = d.toLocaleString('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return s.replace(' ', 'T');
}

/**
 * Normalize event times for Calendar API:
 * - If the LLM sent UTC (e.g. ...Z), convert to local time in calendarTimezone so the event shows at the right local time.
 * - If end <= start, set end to start + 1 hour.
 */
function normalizeEventTimes(
  startTime: string,
  endTime: string,
  timeZone: string
): { startDateTime: string; endDateTime: string } {
  const parse = (s: string): Date => new Date(s.trim());
  const toLocal = (d: Date) => toLocalISO(d, timeZone);
  let start = parse(startTime);
  let end = parse(endTime);
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  }
  return {
    startDateTime: toLocal(start),
    endDateTime: toLocal(end),
  };
}

export async function createCalendarEvent(
  credentialsJson: string,
  summary: string,
  startTime: string,
  endTime: string,
  description?: string
): Promise<string> {
  const calendar = await getCalendarClient(credentialsJson);
  const tz = config.calendarTimezone;
  const { startDateTime, endDateTime } = normalizeEventTimes(startTime, endTime, tz);
  const event: { summary: string; description?: string; start: { dateTime: string; timeZone?: string }; end: { dateTime: string; timeZone?: string } } = {
    summary,
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
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
