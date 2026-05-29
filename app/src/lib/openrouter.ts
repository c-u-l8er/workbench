// OpenRouter client. Goes through /api/llm/openrouter Cloudflare Worker
// (spec 4.3). Key never leaves the browser except as Authorization to the proxy,
// which forwards untouched and never logs.

import { getOpenRouterKey } from './storage';

const PROXY_BASE = '/api/llm/openrouter';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: Array<{ message: ChatMessage; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  cost?: number;
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const key = getOpenRouterKey();
  if (!key) throw new Error('No OpenRouter key set; visit landing page to enter one.');

  const res = await fetch(`${PROXY_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': location.origin
    },
    body: JSON.stringify(req)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Light validation: hit OpenRouter `/auth/key` via the proxy.
 * Returns true if the key authenticates.
 */
export async function validateKey(): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${getOpenRouterKey() ?? ''}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}
