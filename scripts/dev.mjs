// `pnpm dev` (§17): MCP server :8787, simulator :5173 (+ backend :8788), family page :5174, agent worker.
// Loads .env once and passes it to every process, since the package scripts run plain tsx.
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const env = { ...process.env };
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const procs = [
  ["mcp-server", "pnpm --filter @recollect/mcp-server dev"],
  ["sim-api", "pnpm --filter @recollect/alexa-sim exec tsx watch server/index.ts"],
  ["sim-web", "pnpm --filter @recollect/alexa-sim exec vite"],
  ["family", "pnpm --filter @recollect/family exec vite"],
  // Background agents (§9): markers always; entity extraction once BEDROCK_EXTRACT_MODEL_ID is set.
  ["worker", "cd agents && uv run python -m worker"],
];
const colours = [36, 35, 34, 32, 33];
const kids = procs.map(([name, cmd], i) => {
  const p = spawn(cmd, { shell: true, env, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `\x1b[${colours[i]}m${name.padEnd(10)}\x1b[0m│ `;
  for (const s of [p.stdout, p.stderr]) s.on("data", (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, tag)));
  p.on("exit", (code) => console.log(`${tag}exited (${code})`));
  return p;
});
const stop = () => { for (const k of kids) k.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
