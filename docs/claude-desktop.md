# Recollect in Claude Desktop (the ~10 s clip, CLAUDE.md §13)

The Recollect server needs a bearer token on every request. `apps/mcp-server/src/desktop-bridge.ts`
is a small local MCP server that Claude Desktop starts itself: it adds the token and forwards every
request, unchanged, to the real Recollect server over Streamable HTTP. Nothing is answered by the
bridge, so what Claude Desktop shows is the real server's `say`, quotes and latency.

Tested in `apps/mcp-server/test/desktop-bridge.test.ts` (launched over stdio exactly as Claude
Desktop does). Not yet tried in the Claude Desktop app itself.

## Steps

1. Start Recollect (`pnpm dev`, or use the deployed URL).
2. Open Claude Desktop → Settings → Developer → **Edit Config**, which opens
   `claude_desktop_config.json`
   (Windows: `%APPDATA%\Claude\claude_desktop_config.json`;
   macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`).
3. Add the block below. Use absolute paths to your checkout, and the **family** token for the
   clip (Aman asking about Grandma) or the elder token to act as Gurdev.
4. Quit and reopen Claude Desktop. "recollect" appears under the tools menu.

```json
{
  "mcpServers": {
    "recollect": {
      "command": "node",
      "args": [
        "C:/path/to/recollect/node_modules/tsx/dist/cli.mjs",
        "C:/path/to/recollect/apps/mcp-server/src/desktop-bridge.ts"
      ],
      "env": {
        "MCP_SERVER_URL": "http://localhost:8787/mcp",
        "RECOLLECT_TOKEN": "<FAMILY_TOKEN from .env>"
      }
    }
  }
}
```

Keep the token out of screenshots and the video.

## What to record

Ask, as the family: "How did Grandma come to Patiala?" Claude calls `recall_memory` and answers with
her own words and the date ("Gurdev said on 3 August 2026: …"). Then "What was her school like?"
shows the honest "nothing saved" answer. Claude may add its own framing around the tool's answer;
the tool's `say` is what matters on screen, so expand the tool call in the clip.

## Once deployed

Point `MCP_SERVER_URL` at the deployed `/mcp` URL; nothing else changes. A remote connector added
by URL in Claude's settings would also need to send the bearer token, which a connector form may not
allow; the bridge avoids that question.
