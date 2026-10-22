// HTTP front for the MCP server: POST /mcp (Streamable HTTP, stateless), /healthz, demo clock.
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { graphView, localAt, type Ctx, type DemoClock, careCalendar, memoryBookHtml } from "@recollect/core";
import { familyApi } from "./family-api.ts";
import { buildServer, type ToolLog, type ToolRole } from "./tools.ts";

const DOCTOR_REPORT = new URL("../../../data/simulated/doctor-report.html", import.meta.url);

export interface AppOptions {
  ctx: Ctx;
  tokens: { elder: string; family: string };
  /** Present only when DEMO_CLOCK=1: lets the simulator jump to 17:00 or 03:00 (scenarios I, K). */
  demoClock?: DemoClock;
  log?: (line: ToolLog | Record<string, unknown>) => void;
}

export interface App { http: Server; /** Resolves when queued background work has finished. */ idle(): Promise<void> }

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

export function createApp(opts: AppOptions): App {
  const { ctx, tokens, demoClock } = opts;
  const log = opts.log ?? ((line) => console.log(JSON.stringify(line)));

  // One background job at a time, strictly after the tool has answered. Failures never reach a
  // tool response (§9): retry twice, then log.
  let queue: Promise<unknown> = Promise.resolve();
  const background = (job: () => Promise<unknown>) => {
    queue = queue.then(async () => {
      for (let attempt = 1; ; attempt++) {
        try { return await job(); } catch (e) {
          if (attempt === 3) return log({ background: "failed", error: String(e) });
        }
      }
    });
  };

  const roleOf = (req: IncomingMessage): ToolRole | undefined => {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    return token === tokens.elder ? "elder" : token === tokens.family ? "family" : undefined;
  };

  const http = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path === "/healthz") return json(res, 200, { ok: true, quotes: ctx.index.size });

      const role = roleOf(req);
      if (path === "/demo/clock" && demoClock) {
        if (role !== "family") return json(res, 401, { error: "family token required" });
        if (req.method === "POST") {
          const body = (await readJson(req)) as { at?: string } | undefined;
          if (!body?.at) demoClock.reset();
          else if (/^\d{1,2}:\d{2}$/.test(body.at)) demoClock.set(localAt(new Date(), ctx.household.tz, body.at));
          else demoClock.set(new Date(body.at));
        }
        return json(res, 200, { now: ctx.clock.now().toISOString() });
      }

      // The printable doctor report written by the trends agent. Family only.
      if (path === "/report/doctor") {
        if (role !== "family") return json(res, 401, { error: "family token required" });
        // Latest report the trends agent wrote to the graph (§9.3); the demo file until it has run.
        const latest = await ctx.graph.get<{ html?: string }>("DoctorReport", "report-latest");
        if (latest?.html) return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(latest.html);
        if (!existsSync(DOCTOR_REPORT)) return json(res, 404, { error: "no report yet — run the trends agent" });
        return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(DOCTOR_REPORT));
      }

      // Care follow-through: the printable book of her stories, and the check-up invitation once approved.
      if (path === "/report/memory-book") {
        if (role !== "family") return json(res, 401, { error: "family token required" });
        return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(await memoryBookHtml(ctx));
      }
      if (path === "/report/care-calendar.ics") {
        if (role !== "family") return json(res, 401, { error: "family token required" });
        const plan = new URL(req.url ?? "/", "http://localhost").searchParams.get("plan") ?? "";
        try {
          const body = await careCalendar(ctx, plan);
          return void res.writeHead(200, {
            "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="check-up.ics"',
          }).end(body);
        } catch (e) {
          return json(res, 400, { error: (e as Error).message });
        }
      }

      // Live graph panel (§13 P1): either role; private stories are left out for the family.
      if (path === "/api/graph" && req.method === "GET") {
        if (!role) return json(res, 401, { error: "missing or unknown bearer token" });
        return json(res, 200, await graphView(ctx, role));
      }

      // Family page REST (§13). Family token only.
      if (path.startsWith("/api/family/")) {
        if (role !== "family") return json(res, 401, { error: "family token required" });
        const body = req.method === "POST" ? await readJson(req) : undefined;
        if (await familyApi(ctx, req, res, path, body, json)) return;
        return json(res, 404, { error: "not found" });
      }

      if (path !== "/mcp") return json(res, 404, { error: "not found" });
      if (!role) {
        res.setHeader("www-authenticate", "Bearer");
        return json(res, 401, { error: "missing or unknown bearer token" });
      }
      // Stateless: no server-initiated stream, so GET and DELETE have nothing to serve.
      if (req.method !== "POST") {
        res.setHeader("allow", "POST");
        return json(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
      }
      const body = await readJson(req);
      const init = [body].flat().find((m) => (m as { method?: string } | undefined)?.method === "initialize") as
        { params?: { protocolVersion?: string } } | undefined;
      if (init) {
        const requested = init.params?.protocolVersion ?? "";
        log({
          mcp: "initialize", role, requested,
          negotiated: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        });
      }
      const server = buildServer({ ctx, background, log }, role);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) json(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });
  return { http, idle: async () => { await queue; } };
}
