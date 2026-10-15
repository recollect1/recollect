# Open Source mini-challenge

Paste-ready answers for the Devpost fields. Created during the hackathon window (Oct 2026).

**Contribution URL:** https://github.com/yash4428/mcp-latency

**Project repo URL:** https://github.com/recollect1/recollect

**GitHub username:** yash4428

**What it is.** `mcp-latency` is a new, MIT-licensed command-line tool and library that measures how fast
an MCP server's tools answer, against a latency budget. It defaults to the Alexa+ rule: every tool round
trip under 500 ms, with p95 under 250 ms.

**How it works.** It connects to any Streamable HTTP MCP server as a real MCP client (the official
TypeScript SDK), warms up, then calls each tool many times in sequence, the way turns happen in a voice
conversation. It reports p50, p95 and max round-trip times, plus the server's own handler time when the
server reports one in `_meta`, as a Markdown table or JSON. It exits with code 1 when any tool is over
budget or returns an error, so it can block a deploy in CI. It is safe by default: unless you name the
calls to make, it only calls tools the server marks `readOnlyHint` that need no arguments, so it never
writes data on someone else's server. Tested against a local MCP server (fast, slow, failing, writing
and argument-taking tools) in GitHub Actions.

**Why it matters.** Every Alexa+ integration is an MCP server, and Alexa+ drops a tool that takes 500 ms
or more, in the middle of a spoken conversation. Builders had no standard way to check this before
shipping. We built it while proving Recollect's latency (every Recollect tool passes, slowest p95
10.4 ms) and made it general so any team can run one command against their own server.
