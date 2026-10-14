import {
  BedrockRuntimeClient, ConverseCommand, type ContentBlock, type ConverseCommandOutput, type Message, type Tool, type ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { callTool, conn, type Role, type ToolCallRecord } from './mcp.ts';

// The simulated Alexa+ turn (§11): MCP tools → Bedrock toolConfig → Converse loop
// (≤ 4 tool calls). When any tool returns `say`, that text is spoken verbatim and the
// model's own wording is discarded — the grounding guarantee.

export const CHAT_MODEL = process.env.BEDROCK_CHAT_MODEL_ID ?? '';
const MAX_TOOL_CALLS = 4;
const HISTORY_LIMIT = 16;

const SYSTEM = [
  'You are Recollect, a voice assistant on an Echo Show for an older person living with early memory loss, and sometimes their family.',
  'Reply in at most two short sentences, warmly and calmly.',
  'For questions about the past, medicines, today, or where someone is, always call a tool.',
  'For any tool result with a `say` field, output `say` exactly and nothing else.',
  'Never add facts about the past. Never give medical advice.',
  'Never comment on a question being asked before; answer the same way every time.',
  'Never mention speech tracking, markers or trends to her.',
].join(' ');
// Evening routine (§9.4): the simulator reads routine_state and keeps replies to one sentence.
const SHORT = 'It is evening: reply in one short sentence.';

/** Utterances that must be answered from a tool, never from the model. */
const GROUNDED = /\b(remember|story|stories|when did|how did|who('s| was| is)|where (is|was|did)|tell me about|tablet|medicine|pill|dose|did i take|took my|what day|today|date|coming|visit|private|photo|tracking)\b/i;

type Sender = (cmd: ConverseCommand) => Promise<ConverseCommandOutput>;
let bedrock: BedrockRuntimeClient | null = null;
let sender: Sender = (cmd) => {
  bedrock ??= new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  return bedrock.send(cmd);
};
/** Tests only: replace the Bedrock call. */
export function setSender(s: Sender): void {
  sender = s;
}
let chatModel = CHAT_MODEL;
/** Tests only. */
export function setChatModel(id: string): void {
  chatModel = id;
}

const histories = new Map<Role, Message[]>();
export function resetHistory(role?: Role): void {
  if (role) histories.delete(role);
  else histories.clear();
}

function history(role: Role): Message[] {
  let h = histories.get(role);
  if (!h) histories.set(role, (h = []));
  return h;
}

/** Keep the tail of the history, starting at a plain user text message (never mid tool exchange). */
function trimHistory(h: Message[]): void {
  while (h.length > HISTORY_LIMIT) {
    h.shift();
    while (h.length && !(h[0]!.role === 'user' && h[0]!.content?.every((c) => 'text' in c && c.text !== undefined))) h.shift();
  }
}

function toBedrockTools(tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[]): Tool[] {
  return tools.map((t) => {
    const { $schema: _drop, ...schema } = t.inputSchema;
    return { toolSpec: { name: t.name, description: t.description ?? t.name, inputSchema: { json: { type: 'object', properties: {}, ...schema } as never } } };
  });
}

/** What the model sees from a tool: structured content without bulky card payloads. */
function forModel(r: ToolCallRecord): ToolResultContentBlock[] {
  if (!r.structuredContent) return [{ text: r.say ?? '(no result)' }];
  const { card: _card, ...rest } = r.structuredContent;
  return [{ json: rest as never }];
}

export interface TurnResult {
  reply: string;
  source: 'say' | 'model';
  calls: ToolCallRecord[];
  card: { toolName: string; resourceUri: string; args: Record<string, unknown>; result: unknown } | null;
  modelMs: number;
}

export class BedrockNotConfigured extends Error {}

export async function turn(role: Role, userText: string, opts: { shortReplies?: boolean } = {}): Promise<TurnResult> {
  if (!chatModel) throw new BedrockNotConfigured('BEDROCK_CHAT_MODEL_ID is not set');
  const { tools } = await conn(role);
  const toolConfig = { tools: toBedrockTools(tools) };
  const h = history(role);
  h.push({ role: 'user', content: [{ text: userText }] });

  const calls: ToolCallRecord[] = [];
  let modelMs = 0;
  let forced = false;

  for (let step = 0; step <= MAX_TOOL_CALLS; step++) {
    const t0 = performance.now();
    const res = await sender(new ConverseCommand({
      modelId: chatModel,
      system: [{ text: opts.shortReplies ? `${SYSTEM} ${SHORT}` : SYSTEM }],
      messages: h,
      toolConfig: forced ? { ...toolConfig, toolChoice: { any: {} } } : toolConfig,
      inferenceConfig: { maxTokens: 300, temperature: 0.2 },
    }));
    modelMs += performance.now() - t0;
    const msg = res.output?.message;
    if (!msg) throw new Error(`Bedrock returned no message (stopReason=${res.stopReason})`);

    const uses = (msg.content ?? []).filter((c): c is ContentBlock.ToolUseMember => !!c.toolUse);
    if (uses.length === 0) {
      const text = (msg.content ?? []).map((c) => c.text ?? '').join(' ').trim();
      // A memory/medicine/today question answered without a tool: discard and force a tool call.
      if (calls.length === 0 && !forced && GROUNDED.test(userText)) {
        forced = true;
        continue;
      }
      h.push(msg);
      trimHistory(h);
      return { reply: text, source: 'model', calls, card: null, modelMs: Math.round(modelMs) };
    }

    h.push(msg);
    const budget = MAX_TOOL_CALLS - calls.length;
    const results = await Promise.all(
      uses.slice(0, Math.max(0, budget)).map(async (u) => {
        const rec = await callTool(role, u.toolUse.name!, (u.toolUse.input ?? {}) as Record<string, unknown>);
        calls.push(rec);
        return { id: u.toolUse.toolUseId!, rec };
      }),
    );
    // Every toolUse needs a toolResult, including any over budget.
    const content: ContentBlock[] = uses.map((u) => {
      const r = results.find((x) => x.id === u.toolUse.toolUseId);
      return {
        toolResult: {
          toolUseId: u.toolUse.toolUseId!,
          content: r ? forModel(r.rec) : [{ text: 'Not called: tool-call limit reached.' }],
          status: r && r.rec.ok ? 'success' : 'error',
        },
      };
    });
    h.push({ role: 'user', content });

    const says = results.map((r) => r.rec.say).filter((s): s is string => !!s);
    if (says.length > 0) {
      const reply = says.join(' ');
      h.push({ role: 'assistant', content: [{ text: reply }] });
      trimHistory(h);
      const withCard = results.map((r) => r.rec).find((r) => r.resourceUri && r.structuredContent);
      return {
        reply, source: 'say', calls,
        card: withCard ? { toolName: withCard.name, resourceUri: withCard.resourceUri!, args: withCard.args, result: withCard.result } : null,
        modelMs: Math.round(modelMs),
      };
    }
    if (calls.length >= MAX_TOOL_CALLS) break;
  }
  const reply = "Sorry, I couldn't do that just now.";
  h.push({ role: 'assistant', content: [{ text: reply }] });
  trimHistory(h);
  return { reply, source: 'model', calls, card: null, modelMs: Math.round(modelMs) };
}
