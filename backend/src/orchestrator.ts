import { config } from './config.js';
import type { ContextPayload } from './types.js';
import type { McpClientInterface, McpTool } from './mcp.js';
import type { ServerMessage } from './types.js';
import { getAdapter, DEFAULT_MODELS, type LLMOptions, type UnifiedTool } from './llm/index.js';

function buildSystemPrompt(context?: ContextPayload): string {
  const base = `You are a helpful personal assistant. You have access to the user's browser context (open tabs as markdown) when provided. When the user has connected Google, you can create and list calendar events using the create_calendar_event and list_calendar_events tools. Use ISO 8601 for event times (e.g. 2025-03-15T14:00:00Z). Be concise and accurate.`;
  if (!context?.tabs?.length && !context?.closed_tabs?.length) return base;
  const parts = [base];
  if (context.tabs?.length) {
    parts.push('\n\n## Browser context (open tabs)\n');
    for (const tab of context.tabs) {
      if (tab.markdown) parts.push(tab.markdown + '\n\n');
      else parts.push(`- Tab: ${tab.title} (${tab.url}) — content not available\n`);
    }
  }
  if (context.closed_tabs?.length) {
    parts.push('\n## Recently closed tabs (content unavailable)\n');
    for (const t of context.closed_tabs) {
      parts.push(`- ${t.title}: ${t.url}\n`);
    }
  }
  return parts.join('');
}

function mcpToolToUnified(t: McpTool): UnifiedTool {
  const schema = t.inputSchema as { type?: string; properties?: Record<string, unknown>; required?: string[] } | undefined;
  return {
    name: t.name,
    description: t.description ?? '',
    input_schema: schema ? { type: (schema.type as 'object') ?? 'object', properties: schema.properties ?? {}, required: schema.required } : { type: 'object', properties: {} },
  };
}

function buildToolResultMessages(
  provider: LLMOptions['provider'],
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  results: string[]
): unknown[] {
  if (provider === 'claude') {
    return [
      {
        role: 'user' as const,
        content: toolUses.map((tu, i) => ({ type: 'tool_result' as const, tool_use_id: tu.id, content: results[i] ?? '' })),
      },
    ];
  }
  return toolUses.map((tu, i) => ({
    role: 'tool' as const,
    tool_call_id: tu.id,
    content: results[i] ?? '',
  }));
}

export async function runChatStream(
  message: string,
  context: ContextPayload | undefined,
  allowTools: boolean,
  mcpClient: McpClientInterface,
  send: (m: ServerMessage) => void,
  llmOptions: LLMOptions
): Promise<void> {
  const systemPrompt = buildSystemPrompt(context);
  const tools = allowTools ? await mcpClient.listTools() : [];
  const unifiedTools = tools.map(mcpToolToUnified);

  const provider = llmOptions.provider ?? 'claude';
  const apiKey = llmOptions.api_key?.trim() || '';
  const model = llmOptions.model?.trim() || DEFAULT_MODELS[provider];

  if (!apiKey) {
    send({ type: 'error', code: 'bad_request', message: `No API key provided. Set your ${provider} API key in extension settings.` });
    return;
  }

  const adapter = getAdapter(provider);
  let messages: unknown[] = [{ role: 'user' as const, content: message }];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turnsLeft = config.maxToolTurns;

  while (turnsLeft > 0) {
    const result = await adapter.streamTurn(
      {
        systemPrompt,
        messages,
        tools: unifiedTools,
        apiKey,
        model,
      },
      send
    );

    if (result.usage) {
      totalInputTokens += result.usage.input_tokens;
      totalOutputTokens += result.usage.output_tokens;
    }

    if (result.toolUses.length === 0) {
      send({
        type: 'done',
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
      });
      return;
    }

    messages.push(result.assistantMessage);
    const results: string[] = [];
    for (const tu of result.toolUses) {
      let content: string;
      try {
        content = await mcpClient.callTool(tu.name, tu.input);
      } catch (err) {
        content = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      send({ type: 'tool_result', tool_use_id: tu.id, content });
      results.push(content);
    }
    const toolResultMessages = buildToolResultMessages(provider, result.toolUses, results);
    messages = messages.concat(toolResultMessages);
    turnsLeft--;
  }

  send({
    type: 'done',
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
  });
}
