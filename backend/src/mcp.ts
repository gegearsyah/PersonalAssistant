/**
 * MCP client: list tools and call tools.
 * When userId is provided and user has Google connected, exposes Calendar (and later Gmail/Drive) tools.
 */

import { getConnector } from './store/connectors.js';
import { createCalendarEvent, listCalendarEvents } from './calendar.js';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClientInterface {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

const CALENDAR_TOOLS: McpTool[] = [
  {
    name: 'create_calendar_event',
    description: 'Create a new event on the user\'s Google Calendar. Use ISO 8601 for start and end (e.g. 2025-03-15T14:00:00Z).',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', description: 'Start datetime ISO 8601' },
        endTime: { type: 'string', description: 'End datetime ISO 8601' },
        description: { type: 'string', description: 'Optional event description' },
      },
      required: ['summary', 'startTime', 'endTime'],
    },
  },
  {
    name: 'list_calendar_events',
    description: 'List upcoming events from the user\'s Google Calendar.',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Max events to return (default 10)' },
      },
    },
  },
];

const MOCK_TOOLS: McpTool[] = [
  { name: 'echo', description: 'Echo back the message', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
  { name: 'add', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
];

export class UserMcpClient implements McpClientInterface {
  constructor(
    private userId: string,
    private calendarCredentials: string | null
  ) {}

  async listTools(): Promise<McpTool[]> {
    const tools = [...MOCK_TOOLS];
    if (this.calendarCredentials) tools.push(...CALENDAR_TOOLS);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (name === 'echo') return String(args.message ?? '');
    if (name === 'add') return String(Number(args.a) + Number(args.b));

    if (name === 'create_calendar_event' && this.calendarCredentials) {
      const summary = String(args.summary ?? '');
      const startTime = String(args.startTime ?? '');
      const endTime = String(args.endTime ?? '');
      const description = args.description != null ? String(args.description) : undefined;
      if (!summary || !startTime || !endTime) return 'Error: summary, startTime, and endTime are required.';
      try {
        return await createCalendarEvent(this.calendarCredentials, summary, startTime, endTime, description);
      } catch (e) {
        return `Error creating event: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (name === 'list_calendar_events' && this.calendarCredentials) {
      const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 10;
      try {
        return await listCalendarEvents(this.calendarCredentials, maxResults);
      } catch (e) {
        return `Error listing events: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    return `Tool "${name}" is not available. Connect Google in Connectors to use Calendar and other Google services.`;
  }
}

export async function createMcpClient(userId?: string | null): Promise<McpClientInterface> {
  if (!userId) {
    return new UserMcpClient('', null);
  }
  const googleConn = await getConnector(userId, 'google');
  const googleCredentials = googleConn?.credentials ?? null;
  return new UserMcpClient(userId, googleCredentials);
}
