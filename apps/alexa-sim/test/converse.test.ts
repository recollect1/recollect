import type { ConverseCommand, ConverseCommandOutput, Message } from '@aws-sdk/client-bedrock-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// MCP is mocked here so the loop can be tested without a server; the real client is
// exercised by the mcp-server e2e tests.
vi.mock('../server/mcp.ts', () => ({
  conn: async () => ({ tools: [{ name: 'recall_memory', description: 'recall', inputSchema: { type: 'object', properties: { question: { type: 'string' } } }, resourceUri: 'ui://recollect/story-card' }] }),
  callTool: vi.fn(async (_role: string, name: string, args: Record<string, unknown>) => ({
    name, args, ms: 3, serverMs: 2, ok: true,
    say: 'You told me on 28 September 2026: "I came to Patiala in 1968, two days after my wedding."',
    structuredContent: { say: 'You told me on 28 September 2026: "I came to Patiala in 1968, two days after my wedding."', card: { quote: 'x' } },
    resourceUri: 'ui://recollect/story-card', result: {},
  })),
}));

const { turn, setSender, setChatModel, resetHistory } = await import('../server/converse.ts');

const reply = (content: Message['content'], stopReason = 'end_turn'): ConverseCommandOutput =>
  ({ output: { message: { role: 'assistant', content } }, stopReason } as ConverseCommandOutput);

describe('Converse loop', () => {
  beforeEach(() => {
    setChatModel('test-model');
    resetHistory();
  });

  it('speaks the tool `say` verbatim and ignores whatever the model would have said', async () => {
    const seen: ConverseCommand[] = [];
    setSender(async (cmd) => {
      seen.push(cmd);
      return reply([{ text: 'Let me check.' }, { toolUse: { toolUseId: 't1', name: 'recall_memory', input: { question: 'How did I come to Patiala?' } } }], 'tool_use');
    });
    const r = await turn('elder', 'How did I come to Patiala?');
    expect(r.source).toBe('say');
    expect(r.reply).toBe('You told me on 28 September 2026: "I came to Patiala in 1968, two days after my wedding."');
    expect(r.card?.resourceUri).toBe('ui://recollect/story-card');
    expect(seen).toHaveLength(1); // no second model call needed: say short-circuits
    // The tool result recorded for the model carries `say` but not the bulky card payload.
    const toolResult = (seen[0]!.input.messages ?? []).flatMap((m) => m.content ?? []).find((c) => c.toolResult)!.toolResult!;
    const json = toolResult.content![0]!.json as Record<string, unknown>;
    expect(json.say).toBe(r.reply);
    expect(json.card).toBeUndefined();
  });

  it('discards a model-only answer to a memory question and forces a tool call', async () => {
    const choices: unknown[] = [];
    setSender(async (cmd) => {
      choices.push(cmd.input.toolConfig?.toolChoice);
      if (choices.length === 1) return reply([{ text: 'You came to Patiala by bus in 1970.' }]); // invented!
      return reply([{ toolUse: { toolUseId: 't2', name: 'recall_memory', input: { question: 'How did I come to Patiala?' } } }], 'tool_use');
    });
    const r = await turn('elder', 'Tell me about how I came to Patiala');
    expect(choices[1]).toEqual({ any: {} });
    expect(r.reply).not.toContain('bus');
    expect(r.source).toBe('say');
  });

  it('allows short model small talk when no tool is relevant', async () => {
    setSender(async () => reply([{ text: 'Good morning, Gurdev ji.' }]));
    const r = await turn('elder', 'Good morning');
    expect(r).toMatchObject({ source: 'model', reply: 'Good morning, Gurdev ji.', calls: [] });
  });

  it('refuses to run without a configured model', async () => {
    setChatModel('');
    await expect(turn('elder', 'hello')).rejects.toThrow(/BEDROCK_CHAT_MODEL_ID/);
  });
});
