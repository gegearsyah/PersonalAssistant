/**
 * Per-user MCP server config stored in data/mcp-servers.json.
 * Same file-based pattern as connectors; no database required.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { config, getMcpServersConfig, type McpServerConfig } from '../config.js';

const MCP_SERVERS_FILE = join(config.dataDir, 'mcp-servers.json');

type Stored = Record<string, McpServerConfig[]>;

async function ensureDir(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
}

async function readAll(): Promise<Stored> {
  try {
    const data = await readFile(MCP_SERVERS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(stored: Stored): Promise<void> {
  await ensureDir();
  await writeFile(MCP_SERVERS_FILE, JSON.stringify(stored, null, 2), 'utf-8');
}

function isValidConfig(s: unknown): s is McpServerConfig {
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof (s as McpServerConfig).id === 'string' &&
    typeof (s as McpServerConfig).command === 'string'
  );
}

export async function getUserMcpServers(userId: string): Promise<McpServerConfig[]> {
  const stored = await readAll();
  const raw = stored[userId];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidConfig);
}

export async function setUserMcpServers(userId: string, servers: McpServerConfig[]): Promise<McpServerConfig[]> {
  const list = servers.filter(isValidConfig);
  const stored = await readAll();
  stored[userId] = list;
  await writeAll(stored);
  return list;
}

/** Config to use for a user: saved list if any, otherwise env MCP_SERVERS_JSON. */
export async function getMcpServersConfigForUser(userId: string): Promise<McpServerConfig[]> {
  const fromStore = await getUserMcpServers(userId);
  if (fromStore.length > 0) return fromStore;
  return getMcpServersConfig();
}
