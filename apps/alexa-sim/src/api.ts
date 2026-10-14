export type Role = 'elder' | 'family';

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  ms: number;
  serverMs: number | null;
  ok: boolean;
  say: string | null;
  structuredContent: Record<string, unknown> | null;
  resourceUri: string | null;
  result: unknown;
}

export interface CardRef {
  toolName: string;
  resourceUri: string;
  args: Record<string, unknown>;
  result: { structuredContent?: Record<string, unknown>; content?: unknown[]; _meta?: Record<string, unknown> };
}

export interface TurnResult {
  reply: string;
  source: 'say' | 'model';
  calls: ToolCallRecord[];
  card: CardRef | null;
  modelMs?: number;
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? String(res.status), body.message ?? `Request failed (${res.status})`);
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<T>(r));

export const api = {
  status: () => fetch('/api/status').then((r) => json<Record<string, any>>(r)),
  turn: (role: Role, text: string, shortReplies = false) => post<TurnResult>('/api/turn', { role, text, shortReplies }),
  story: (text: string) => post<TurnResult>('/api/story', { text }),
  direct: (role: Role, name: string, args: Record<string, unknown>) => post<TurnResult>('/api/direct', { role, name, args }),
  tool: (role: Role, name: string, args: Record<string, unknown>) => post<ToolCallRecord>('/api/tool', { role, name, args }),
  resource: (role: Role, uri: string) =>
    fetch(`/api/resource?role=${role}&uri=${encodeURIComponent(uri)}`).then((r) => json<{ html: string }>(r)),
  reset: (role: Role) => post('/api/reset', { role }),
  clock: (at?: string) => post<{ now: string }>('/api/clock', at ? { at } : {}),
};

/** routine_state payload (§9.4): read by the home panel and for short-reply mode. */
export interface RoutineState {
  say: string;
  routine: 'evening' | 'night' | 'none';
  shortReplies: boolean;
  greeting?: string;
  localTime: string;
  devices: { id: string; kind: 'light' | 'speaker'; room: string; state: string }[];
}
