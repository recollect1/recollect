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
  'She may speak Hindi, English or a mix of both.',
  'Tool arguments: names, medicines and questions in English (translate them); her own words (stories, photo',
  'descriptions, her day, what she said at night) exactly as spoken, never translated.',
  'If you reply without a tool, reply in the language she used.',
].join(' ');
// Evening routine (§9.4): the simulator reads routine_state and keeps replies to one sentence.
const SHORT = 'It is evening: reply in one short sentence.';

/** Utterances that must be answered from a tool, never from the model. */
const GROUNDED_HI = /गोली|दवा|दवाई|आज|कौन|कहाँ|कहां|याद|कहानी|बाज़ार|बाजार|बाहर|तारीख़|तारीख|दिन|\b(goli|dawai|aaj|kaun|kahan|yaad|kahani|bahar)\b/i;
const GROUNDED = /\b(remember|story|stories|when did|how did|who('s| was| is)|where (is|was|did)|tell me about|tablet|medicine|pill|dose|did i take|took my|what day|today|date|coming|visit|private|photo|tracking|going out|go out|go to the|market|leave|leaving)\b/i;

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

/**
 * Hindi or Hinglish: the tool-choosing model gets her sentence as one short English line, so tool
 * arguments (a question, a name, a medicine) match the English memory index and names, and Nova
 * never has to put Devanagari inside a tool call. This happens in the client, before any tool call.
 * Only the lookup changes: answers are still her stored words and fixed Hindi templates, and her
 * own words (a story, her day, a photo description) are always passed through exactly as she said them.
 */
const VERBATIM: Record<string, string> = { remember_story: 'text', photo_moment: 'text', talk_about_today: 'answer' };
const MAX_TRANSLATION_WORDS = 30;

/** One short English sentence, or null if the model's output does not look like a plain translation. */
export function cleanTranslation(raw: string, source: string): string | null {
  const line = raw.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  const text = line.replace(/^(english|translation)\s*:\s*/i, '').replace(/^["“']|["”']$/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const limit = Math.max(MAX_TRANSLATION_WORDS, source.split(/\s+/).length * 3);
  return text && words <= limit ? text : null;
}

async function toEnglish(text: string): Promise<string> {
  const res = await sender(new ConverseCommand({
    modelId: chatModel,
    system: [{ text:
      'Translate what an older woman said (Hindi, Hinglish or English) into one short, plain English sentence with ' +
      'the same meaning. Keep people and place names as they are, in Latin letters. Do not answer, explain or add ' +
      'anything. Output only that one sentence.' }],
    messages: [{ role: 'user', content: [{ text }] }],
    inferenceConfig: { maxTokens: 80, temperature: 0 },
  }));
  const raw = (res.output?.message?.content ?? []).map((c) => c.text ?? '').join(' ');
  return cleanTranslation(raw, text) ?? text;
}

export async function turn(
  role: Role, spokenText: string, opts: { shortReplies?: boolean; lang?: 'en' | 'hi' } = {},
): Promise<TurnResult & { understood?: string }> {
  if (!chatModel) throw new BedrockNotConfigured('BEDROCK_CHAT_MODEL_ID is not set');
  const { tools } = await conn(role);
  const toolConfig = { tools: toBedrockTools(tools) };
  const h = history(role);
  const understood = opts.lang === 'hi' ? await toEnglish(spokenText) : undefined;
  const userText = understood ?? spokenText;
  const mark = h.length;
  h.push({ role: 'user', content: [{ text: userText }] });

  const calls: ToolCallRecord[] = [];
  let modelMs = 0;
  let forced = false;
  try {

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
      if (calls.length === 0 && !forced && (GROUNDED.test(userText) || GROUNDED_HI.test(userText))) {
        forced = true;
        continue;
      }
      h.push(msg);
      trimHistory(h);
      return { reply: text, source: 'model', calls, card: null, modelMs: Math.round(modelMs), ...(understood ? { understood } : {}) };
    }

    h.push(msg);
    const budget = MAX_TOOL_CALLS - calls.length;
    const results = await Promise.all(
      uses.slice(0, Math.max(0, budget)).map(async (u) => {
        const args = { ...((u.toolUse.input ?? {}) as Record<string, unknown>) };
        // Her own words are kept exactly as she said them, never the English line.
        const field = VERBATIM[u.toolUse.name!];
        if (understood && field && field in args) args[field] = spokenText;
        const rec = await callTool(role, u.toolUse.name!, args);
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
        modelMs: Math.round(modelMs), ...(understood ? { understood } : {}),
      };
    }
    if (calls.length >= MAX_TOOL_CALLS) break;
  }
  } catch (e) {
    h.length = mark; // a failed turn is not replayed into the next one
    throw e;
  }
  const reply = "Sorry, I couldn't do that just now.";
  h.push({ role: 'assistant', content: [{ text: reply }] });
  trimHistory(h);
  return { reply, source: 'model', calls, card: null, modelMs: Math.round(modelMs) };
}
