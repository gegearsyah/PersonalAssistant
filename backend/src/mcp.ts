/**
 * MCP client: list tools and call tools.
 * Built-in: Google (Calendar, Docs), echo, add.
 * External: from MCP_SERVERS_JSON (Brave Search, Time, Todo, etc.) — see docs/EXTERNAL_MCP_FOR_STUDENTS.md.
 */

import { getConnector } from './store/connectors.js';
import { createCalendarEvent, listCalendarEvents } from './calendar.js';
import { createGoogleDoc } from './google-docs.js';
import { listExternalTools, callExternalTool, hasExternalTool } from './external-mcp.js';

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
    description: 'Create a new event on the user\'s Google Calendar. Pass start and end in ISO 8601 UTC (e.g. 2026-03-13T16:55:00Z). The server converts to the user\'s timezone. If the user does not specify duration, use 1 hour. endTime must be after startTime.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', description: 'Start datetime ISO 8601 UTC (e.g. 2026-03-13T16:55:00Z)' },
        endTime: { type: 'string', description: 'End datetime ISO 8601 UTC; must be after startTime' },
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
  {
    name: 'create_google_doc',
    description: 'Create a new Google Doc with the given title and body content. Use this when the user asks to summarize a page and put it in a doc, or to create a document with specific content. The content is the full body text (e.g. a summary).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title (e.g. "Research Summary")' },
        content: { type: 'string', description: 'Full body text to put in the document' },
      },
      required: ['title', 'content'],
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
    const builtInNames = new Set(tools.map((t) => t.name));
    const external = await listExternalTools(this.userId);
    for (const t of external) {
      if (!builtInNames.has(t.name)) {
        tools.push(t);
        builtInNames.add(t.name);
      }
    }
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

    if (name === 'create_google_doc' && this.calendarCredentials) {
      const title = String(args.title ?? '').trim();
      const content = String(args.content ?? '').trim();
      if (!title || !content) return 'Error: title and content are required for create_google_doc.';
      try {
        return await createGoogleDoc(this.calendarCredentials, title, content);
      } catch (e) {
        return `Error creating document: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    const externalHas = await hasExternalTool(this.userId, name);
    if (externalHas) return callExternalTool(this.userId, name, args);

    return `Tool "${name}" is not available. Connect Google in Connectors for Calendar/Docs, or add external MCP servers via MCP_SERVERS_JSON.`;
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
