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

const { turn, setSender, setChatModel, resetHistory, cleanTranslation } = await import('../server/converse.ts');
const { callTool } = await import('../server/mcp.ts');

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

  it('Hindi: the tool-choosing model gets one short English line; the answer is still the tool `say`', async () => {
    const seen: ConverseCommand[] = [];
    setSender(async (cmd) => {
      seen.push(cmd);
      if (seen.length === 1) return reply([{ text: 'How did I come to Patiala?\n\nExplanation: "मैं" means I.' }]);
      return reply([{ toolUse: { toolUseId: 'h1', name: 'recall_memory', input: { question: 'How did I come to Patiala?' } } }], 'tool_use');
    });
    const r = await turn('elder', 'मैं पटियाला कैसे आई थी?', { lang: 'hi' });
    expect(r.understood).toBe('How did I come to Patiala?'); // the explanation is cut off
    const asked = (seen[1]!.input.messages ?? []).flatMap((m) => m.content ?? []).find((c) => c.text)?.text;
    expect(asked).toBe('How did I come to Patiala?');
    expect(r.source).toBe('say');
  });

  it('Hindi: her own words reach remember_story exactly as she said them, never the translation', async () => {
    let n = 0;
    setSender(async () => (++n === 1
      ? reply([{ text: 'There was a big peepal tree in our village.' }])
      : reply([{ toolUse: { toolUseId: 'h2', name: 'remember_story', input: { text: 'There was a big peepal tree in our village.' } } }], 'tool_use')));
    await turn('elder', 'हमारे गाँव में एक बड़ा पीपल का पेड़ था।', { lang: 'hi' });
    expect(vi.mocked(callTool).mock.calls.at(-1)).toEqual(['elder', 'remember_story', { text: 'हमारे गाँव में एक बड़ा पीपल का पेड़ था।' }]);
  });

  it('cleanTranslation keeps one plain sentence and rejects an essay', () => {
    expect(cleanTranslation('Translation: "Where is Aman?"', 'अमन कहाँ है?')).toBe('Where is Aman?');
    expect(cleanTranslation('What was my school like?\n\nHere is an expansion...', 'मेरा स्कूल कैसा था?')).toBe('What was my school like?');
    expect(cleanTranslation(Array(60).fill('word').join(' '), 'मेरा स्कूल कैसा था?')).toBeNull();
  });
});
