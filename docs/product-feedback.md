# Product feedback

What we used each tool for, what worked, what needs work, how onboarding felt, and whether we would
build with it again. Entries marked *pending a live run* describe code that is built and tested with
stand-ins but has not yet called the real service.

## MCP TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.1)

- **Worked well:** stateless Streamable HTTP with one `McpServer` per request made per-token roles
  simple: each request only sees the tools its role may call. Protocol 2025-11-25 negotiated with
  the SDK client without any configuration.
- **Friction:** `registerTool`'s callback type cannot be satisfied from a wrapper that is generic
  over the input shape without a cast (friction log 8).
- **Friction:** nothing in the tool result type suggests where per-call timing belongs; we used
  `_meta["recollect/latencyMs"]`. A documented convention would help hosts show latency.
- **Wish:** a documented way to read the negotiated protocol version on the server in stateless
  mode. We log it by inspecting the `initialize` request ourselves.

## MCP Apps (`@modelcontextprotocol/ext-apps` 1.7.5)

- **Used for:** five cards (story, today, who's-who, speech trend, weekly photo) built as single-file
  HTML with the `App` class; `registerAppResource` on the server; `AppBridge` + `PostMessageTransport`
  hosting them in the simulator with no MCP client in the browser (`oncalltool` proxied to our backend).
- **Worked well:** `registerAppResource` and the `_meta.ui.resourceUri` declaration are small and
  predictable; the View API (`ontoolresult`, `sendMessage`, `setupSizeChangedNotifications`) covered
  every card, including the today card's "Call Simran" button that messages the host instead of dialling.
- **Needs work:** ext-apps 2.x is built on the v2 split MCP SDK, which only shows up in its type
  imports; we pinned 1.7.x to stay on `@modelcontextprotocol/sdk` (friction log 18). The bridge must be
  connected *before* the card's iframe loads or the card's `initialize` can be lost; the docs do not
  say so. Single-file cards come out around 235 KB because the protocol layer and zod are bundled.
  1.7 has no `AppBridge.close()` (2.x does), so teardown differs between majors.
- **Onboarding:** the type docs have examples; a minimal "host a card in a srcdoc iframe" snippet would
  have saved an hour.
- **Would build again:** yes. A card that shows her own words next to the spoken answer is the clearest
  way to show that nothing is invented.

## Amazon Bedrock (Converse API) — live run 15 Oct (Amazon Nova Pro)

- **Used for:** (1) the simulator's conversation loop: MCP `tools/list` mapped to Converse `toolConfig`,
  up to 4 tool calls a turn, a tool's `say` spoken verbatim; (2) the model behind the Strands extract agent.
- **Worked well:** Converse's tool-use shape maps one to one onto MCP tools, so the bridge is about 30
  lines. On the first live run with Nova Pro, all ten demo questions (dose log and check, who's-who,
  where-is twice, today, nothing-saved, two memory questions, the family trend) called the right tool,
  and small talk got a plain reply without one. About 1.5–2.4 s per turn including the tool call.
  `toolChoice: { any: {} }` gives a clean way to force a tool when the model tries to answer a memory
  question itself.
- **Needs work:** model access is the hard part, and it is invisible until you call the model.
  `list-foundation-models` showed Claude Haiku 4.5 and 5.5 as ACTIVE, but the calls failed with "Model
  use case details have not been submitted" and "not available for this account" (friction log 21).
  A per-account "can I call this?" flag in the listing would save the guesswork. Command `input` is
  held by reference, so a test that inspects `messages` after the call sees later mutations.
- **Would build again:** yes; Nova Pro needed no extra access step.

## Strands Agents SDK (1.60) — live run 15 Oct (Nova Pro)

- **Used for:** the extract agent (`agents/extract/agent.py`): `Agent(model=BedrockModel(...))` with
  `structured_output(ExtractionOut, prompt)` returning a Pydantic object, one fresh agent per sentence so
  no history leaks between stories, temperature 0.
- **Worked well:** typed structured output removed all JSON parsing. Live on Nova Pro it found the
  people, places, things and years in the seed sentences, about 1–3 s per sentence; every span passed
  the "exact words she said" check.
- **Needs work:** with Nova 2 Lite, `structured_output` raised a Pydantic error because the model
  returned `null` for a list (friction log 22); the schema now accepts it, but the failure surfaced deep
  in the model adapter. `Agent.__init__` takes over thirty parameters; a short "structured extraction"
  recipe would help. `callback_handler=None` is needed to stop console streaming in a background worker.
- **Would build again:** yes, for the typed output alone.

## Amazon Bedrock AgentCore Runtime (`bedrock-agentcore` 1.24) — deployed 16 Oct

- **Used for:** hosting the extract agent (`agents/agentcore_app.py`, `BedrockAgentCoreApp` +
  `@app.entrypoint`); the deployed worker calls it with `InvokeAgentRuntime` (`agents/extract/agentcore.py`).
- **Worked well:** the runtime contract is tiny — `/invocations` and `/ping` on port 8080 — and runs
  locally unchanged, so the agent was testable before any deployment. Deployment was one image push and
  one `create-agent-runtime` call; READY in under two minutes.
- **Needs work:** (1) the first runtime in an account needs `iam:CreateServiceLinkedRole`, and the error
  does not say for which service (friction log 25). (2) A new `runtimeSessionId` per call means a new
  microVM per call: 11–12 s per sentence for us until we reused one session (1–3 s). For stateless
  agents that is easy to miss; the docs could say so next to the session ID parameter (friction log 26).
  (3) `runtimeSessionId` has a 33-character minimum, found in the service model, not an error message.
  (4) The image must be arm64; we built it on an arm64 EC2 host to avoid cross-building.
- **Would build again:** yes. Keeping the model-calling agent out of the always-on worker, with its own
  narrow execution role, is a clean split.

## Amazon SNS — *pending a live run*

- **Used for:** optional SMS to the family when a night-time alert is raised, sent in the background
  after the tool has answered (`apps/mcp-server/src/sms.ts`). Off unless `SNS_TOPIC_ARN` is set.

## FalkorDB (Docker image, `falkordb` npm and Python clients)

- **Used for:** the whole memory graph: her verbatim sentences, the people and places in them,
  retellings, family, tablets, questions, speech markers and trend cards, read by the MCP tools, the
  Python agents, the timeline and the doctor report.
- **Worked well:** one `docker compose up` and it was running; Cypher made the links that matter
  (sentence → person or place, story → earlier telling) one-line queries, and the same graph served
  TypeScript and Python. Queries were fast enough to keep every tool inside the Alexa+ budget.
- **Needs work:** we could not run it on the first build machine (no Docker; friction log 10), so we
  wrote an in-memory adapter for tests and local development. A small embedded or in-process mode for
  tests would help.
- **Again?** Yes.

## Amazon Polly

- **Used for:** Recollect's voice in the demo video (neural voices, SSML).
- **Worked well:** quick to call from boto3; the neural voices sound natural; the en-IN and hi-IN
  voices were a good fit for an Indian household.
- **Needs work:** some voices are standard-engine only, so the quality differs between voices.
- **Again?** Yes.

## Amazon EC2, ECR, IAM and SSM Parameter Store (the deployment, 16–21 Oct)

- **Used for:** one EC2 host (Docker Compose: FalkorDB, MCP server, web, worker, Caddy for HTTPS),
  images in ECR, AWS access only through the instance role, secrets in Parameter Store.
- **Worked well:** instance roles meant no keys on the host; Parameter Store kept secrets out of the
  images.
- **Needs work:** from India the round trip to us-east-1 alone is about 280 ms, more than the Alexa+
  budget allows (friction log 29); a clear note on which region Alexa+ calls from would help builders.
- **Again?** Yes, for a small deployment like this.
