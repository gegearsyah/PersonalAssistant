import { config } from './config.js';

const CALENDAR_TZ = config.calendarTimezone;
import type { ContextPayload } from './types.js';
import type { McpClientInterface, McpTool } from './mcp.js';
import type { ServerMessage } from './types.js';
import { getAdapter, DEFAULT_MODELS, type LLMOptions, type UnifiedTool } from './llm/index.js';

export let chatHistory: unknown[] = [];

export function clearChatHistory(): void {
  chatHistory = [];
}

function buildSystemPrompt(context?: ContextPayload, toolSummary = ''): string {
  const base = `You are a helpful personal assistant for students. You have access to the user's browser context (open tabs as markdown) when provided.

## Demo capabilities (use when the user asks)
1. **Ask about the page** — Answer questions about the current page or open tabs using the browser context (titles, URLs, and markdown content). Be specific and cite the page when relevant.
2. **Summarize the page** — When asked to summarize a page or "this page", write a clear summary from the browser context. Do not invent content that is not in the context.
3. **Calendar (deadlines, events)** — When Google Workspace MCP is connected and the user mentions deadlines, due dates, or events, use the calendar tools (e.g. create_calendar_event, list_calendar_events) if available. Timezone: ${CALENDAR_TZ}. Use ISO 8601 UTC; default 1 hour if not specified.
4. **Put summary in Google Docs** — When Google Workspace MCP is connected and the user wants a summary (or any text) in a Google Doc, use create_google_doc (or the MCP’s doc tool) with a clear title and full content. For "summarize this page and put it in a doc": first write the summary from the browser context, then call the doc tool. Do not create calendar events for document requests.
5. **Other tools** — Use any additional tools from connected MCP servers (e.g. time, web search, fetch, memory) when they fit the request.

Be concise and accurate.${toolSummary}`;
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

function buildToolSummary(tools: McpTool[]): string {
  if (tools.length === 0) return '';
  const names = tools.map((t) => t.name).join(', ');
  return `\n\n## Available tools (use when relevant)\n${names}.`;
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
  const tools = allowTools ? await mcpClient.listTools() : [];
  const systemPrompt = buildSystemPrompt(context, buildToolSummary(tools));
  const unifiedTools = tools.map(mcpToolToUnified);

  const provider = llmOptions.provider ?? 'claude';
  const apiKey = llmOptions.api_key?.trim() || '';
  const model = llmOptions.model?.trim() || DEFAULT_MODELS[provider];

  if (!apiKey) {
    send({ type: 'error', code: 'bad_request', message: `No API key provided. Set your ${provider} API key in extension settings.` });
    return;
  }

  const adapter = getAdapter(provider);
  let messages: unknown[] = [...chatHistory, { role: 'user' as const, content: message }];
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
      chatHistory = [...messages];
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

  chatHistory = [...messages];
  send({
    type: 'done',
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
  });
}
