/**
 * Connect to external MCP servers (stdio), aggregate their tools, and route call_tool.
 * Config: per-user from store (data/mcp-servers.json) or fallback to MCP_SERVERS_JSON env.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getMcpServersConfig } from './config.js';
import { getMcpServersConfigForUser } from './store/mcp-servers.js';
import type { McpServerConfig } from './config.js';
import type { McpTool } from './mcp.js';

interface ConnectedServer {
  id: string;
  client: Client;
  transport: StdioClientTransport;
  tools: McpTool[];
}

const cacheByUser = new Map<string, { servers: ConnectedServer[]; toolToServer: Map<string, ConnectedServer> }>();

function mcpApiToolToOur(t: { name: string; description?: string; inputSchema?: Record<string, unknown> }): McpTool {
  return {
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
  };
}

async function connectServer(serverConfig: McpServerConfig): Promise<ConnectedServer | null> {
  try {
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      env: serverConfig.env,
    });
    const client = new Client(
      { name: 'personal-assistant-backend', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(transport);
    const listResult = await client.listTools();
    const tools = (listResult.tools ?? []).map(mcpApiToolToOur);
    return { id: serverConfig.id, client, transport, tools };
  } catch (err) {
    console.error(`[MCP] Failed to connect to server "${serverConfig.id}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function getConfigForUser(userId: string): Promise<McpServerConfig[]> {
  if (userId) return getMcpServersConfigForUser(userId);
  return getMcpServersConfig();
}

async function ensureConnected(userId: string): Promise<{ servers: ConnectedServer[]; toolToServer: Map<string, ConnectedServer> }> {
  const existing = cacheByUser.get(userId);
  if (existing) return existing;
  const configs = await getConfigForUser(userId);
  const servers: ConnectedServer[] = [];
  const toolToServer = new Map<string, ConnectedServer>();
  for (const cfg of configs) {
    const s = await connectServer(cfg);
    if (s) {
      servers.push(s);
      for (const t of s.tools) {
        if (!toolToServer.has(t.name)) toolToServer.set(t.name, s);
      }
    }
  }
  const entry = { servers, toolToServer };
  cacheByUser.set(userId, entry);
  return entry;
}

export async function listExternalTools(userId: string): Promise<McpTool[]> {
  const { toolToServer } = await ensureConnected(userId);
  return Array.from(toolToServer.keys()).map((name) => {
    const s = toolToServer.get(name)!;
    const t = s.tools.find((x) => x.name === name)!;
    return t;
  });
}

export async function callExternalTool(userId: string, name: string, args: Record<string, unknown>): Promise<string> {
  const { toolToServer } = await ensureConnected(userId);
  const server = toolToServer.get(name);
  if (!server) return `Tool "${name}" is not provided by any connected external MCP server.`;
  try {
    const result = await server.client.callTool({ name, arguments: args ?? {} });
    const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
    if (Array.isArray(content)) {
      const textParts = content.filter((c) => c.type === 'text' && typeof c.text === 'string').map((c) => (c as { text: string }).text);
      return textParts.join('\n') || JSON.stringify(result);
    }
    if (typeof (result as { toolResult?: unknown }).toolResult !== 'undefined') {
      return JSON.stringify((result as { toolResult: unknown }).toolResult);
    }
    return JSON.stringify(result);
  } catch (err) {
    return `Error calling ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function hasExternalTool(userId: string, name: string): Promise<boolean> {
  return ensureConnected(userId).then(({ toolToServer }) => toolToServer.has(name));
}

export async function closeExternalMcp(): Promise<void> {
  for (const entry of cacheByUser.values()) {
    for (const s of entry.servers) {
      try {
        await s.transport.close();
      } catch {
        // ignore
      }
    }
  }
  cacheByUser.clear();
}
