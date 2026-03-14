import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';

export type ConnectorService = 'notion' | 'google';

export interface Connector {
  userId: string;
  service: ConnectorService;
  /** Stored credentials (e.g. API key or encrypted OAuth token). For production use proper encryption. */
  credentials: string;
  connectedAt: string;
}

const CONNECTORS_FILE = join(config.dataDir, 'connectors.json');

async function ensureDir(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
}

async function readConnectors(): Promise<Connector[]> {
  try {
    const data = await readFile(CONNECTORS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeConnectors(connectors: Connector[]): Promise<void> {
  await ensureDir();
  await writeFile(CONNECTORS_FILE, JSON.stringify(connectors, null, 2), 'utf-8');
}

export async function listConnectors(userId: string): Promise<Connector[]> {
  const all = await readConnectors();
  return all.filter((c) => c.userId === userId);
}

export async function getConnector(userId: string, service: ConnectorService): Promise<Connector | null> {
  const all = await readConnectors();
  return all.find((c) => c.userId === userId && c.service === service) ?? null;
}

export async function setConnector(userId: string, service: ConnectorService, credentials: string): Promise<Connector> {
  const all = await readConnectors();
  const existing = all.findIndex((c) => c.userId === userId && c.service === service);
  const conn: Connector = {
    userId,
    service,
    credentials: credentials.trim(),
    connectedAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    all[existing] = conn;
  } else {
    all.push(conn);
  }
  await writeConnectors(all);
  return conn;
}

export async function removeConnector(userId: string, service: ConnectorService): Promise<boolean> {
  const all = await readConnectors();
  const filtered = all.filter((c) => !(c.userId === userId && c.service === service));
  if (filtered.length === all.length) return false;
  await writeConnectors(filtered);
  return true;
}

export const CONNECTOR_DEFINITIONS: Record<
  ConnectorService,
  { name: string; description: string; needsApiKey: boolean }
> = {
  notion: {
    name: 'Notion',
    description: 'Search pages and databases, read content',
    needsApiKey: true,
  },
  google: {
    name: 'Google',
    description: 'Calendar, Gmail, Drive (one sign-in for all)',
    needsApiKey: false,
  },
};
