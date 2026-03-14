import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  backendApiKey: process.env.BACKEND_API_KEY ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
  dataDir: process.env.DATA_DIR ?? './data',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  maxMessageLength: 32_000,
  maxContextChars: 200_000,
  maxTabs: 30,
  rateLimitRequestsPerMinute: 60,
  rateLimitConcurrentStreams: 10,
  claudeModel: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
  claudeMaxTokens: 4096,
  maxToolTurns: 5,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
  /** Timezone for calendar events (e.g. Asia/Jakarta). Events are created in this timezone so "23:55" stays 23:55 for the user. */
  calendarTimezone: process.env.CALENDAR_TIMEZONE ?? 'Asia/Jakarta',
  /** Optional JSON array of external MCP servers. Each: { "id": "brave", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-brave-search"], "env": { "BRAVE_API_KEY": "..." } }. */
  mcpServersJson: process.env.MCP_SERVERS_JSON ?? '',
} as const;

export type McpServerConfig = {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export function getMcpServersConfig(): McpServerConfig[] {
  const raw = config.mcpServersJson.trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    return (arr || []).filter(
      (s): s is McpServerConfig =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as McpServerConfig).id === 'string' &&
        typeof (s as McpServerConfig).command === 'string'
    );
  } catch {
    return [];
  }
}
