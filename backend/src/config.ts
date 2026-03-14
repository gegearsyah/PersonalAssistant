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
} as const;
