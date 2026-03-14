/**
 * Shared types for WebSocket API and context payload.
 * Aligned with docs/API_CONTRACTS_AND_PATTERNS.md
 */

export interface ContextTab {
  id: number;
  url: string;
  title: string;
  active?: boolean;
  markdown: string | null;
}

export interface ClosedTabRef {
  url: string;
  title: string;
  markdown: string | null;
}

export interface ContextPayload {
  tabs: ContextTab[];
  closed_tabs: ClosedTabRef[];
  totalChars?: number;
  truncated?: boolean;
}

export type ClientMessage =
  | { type: 'auth'; token: string }
  | {
    type: 'chat';
    id: string;
    message: string;
    context?: ContextPayload;
    allow_tools?: boolean;
    /** User's LLM provider (claude, openai, groq) and their API key + model */
    provider?: 'claude' | 'openai' | 'groq';
    api_key?: string;
    model?: string;
  }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'auth_ok' }
  | { type: 'error'; code: string; message: string }
  | { type: 'text_delta'; delta: string }
  | {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
  }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | {
    type: 'done';
    message_id?: string;
    usage?: { input_tokens: number; output_tokens: number };
  }
  | { type: 'pong' };
