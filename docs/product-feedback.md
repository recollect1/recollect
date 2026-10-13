# Product feedback

Draft notes from the build. **A human must confirm every entry before submission** (CLAUDE.md §18.6).
Sections for ext-apps, Bedrock, Strands and AgentCore are empty until those parts are built.

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

## MCP Apps (`@modelcontextprotocol/ext-apps`)

Not used yet.

## Amazon Bedrock

Not used yet.

## Strands Agents SDK

Not used yet.

## Bedrock AgentCore

Not used yet.
