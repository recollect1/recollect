// pnpm test:latency — every elder tool 50× against MCP_SERVER_URL through a real MCP client (§15).
// Fails if any tool's p95 is ≥ 250 ms or any single call is ≥ 500 ms (§1.3).
// It writes probe data (private stories, doses, asks) to the target: re-seed before a demo.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_SERVER_URL ?? "http://localhost:8787/mcp");
const token = process.env.ELDER_TOKEN;
if (!token) { console.error("Set ELDER_TOKEN."); process.exit(1); }
const RUNS = Number(process.env.LATENCY_RUNS ?? 50);
const P95_BUDGET = 250, MAX_BUDGET = 500;

const CALLS: [tool: string, args: Record<string, unknown>][] = [
  ["remember_story", { text: "This is a latency probe. It is not one of her stories.", private: true }],
  ["recall_memory", { question: "How did I come to Patiala?" }],
  ["recall_memory", { question: "What was my school like?" }],
  ["whats_today", {}],
  ["check_dose", { medicine: "BP tablet" }],
  ["log_dose", { medicine: "calcium tablet" }],
  ["where_is", { person: "Aman" }],
  ["who_is", { name: "Simran" }],
  ["keep_private", {}],
  ["pause_tracking", {}],
  ["story_prompt", {}],
  ["photo_moment", {}],
  ["routine_state", {}],
];

const client = new Client({ name: "recollect-latency", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { authorization: `Bearer ${token}` } },
}));

let failed = false;
console.log(`Target: ${url.href} · ${RUNS} calls per tool\n`);
console.log("| Tool | p50 ms | p95 ms | max ms | server p95 ms | OK |");
console.log("|---|---|---|---|---|---|");
const only = process.env.LATENCY_ONLY;
for (const [tool, args] of CALLS) {
  if (only && tool !== only) continue;
  const roundTrip: number[] = [], inServer: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const r = await client.callTool({ name: tool, arguments: args });
    roundTrip.push(performance.now() - t0);
    if (r.isError) { console.error(`${tool} returned an error`); failed = true; }
    inServer.push(Number(r._meta?.["recollect/latencyMs"] ?? 0));
  }
  const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)] ?? 0;
  const p95 = pct(roundTrip, 0.95), max = Math.max(...roundTrip);
  const ok = p95 < P95_BUDGET && max < MAX_BUDGET;
  if (!ok) failed = true;
  const label = tool === "recall_memory" ? `recall_memory (${String(args.question).includes("school") ? "nothing saved" : "found"})` : tool;
  console.log(`| ${label} | ${pct(roundTrip, 0.5).toFixed(0)} | ${p95.toFixed(0)} | ${max.toFixed(0)} | ${pct(inServer, 0.95).toFixed(0)} | ${ok ? "yes" : "NO"} |`);
}
await client.close();
console.log(failed ? "\nFAIL: over the 250 ms p95 / 500 ms max budget" : "\nPASS: every tool under 250 ms p95 and 500 ms max");
process.exit(failed ? 1 : 0);
