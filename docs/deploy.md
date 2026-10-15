# Deploying Recollect

Four services. Railway is the host the spec names (§17); any container host works.

| Service | Image | Port | Public? |
|---|---|---|---|
| FalkorDB | `falkordb/falkordb:latest` (volume on `/var/lib/falkordb/data`) | 6379 | **No** — private network only |
| MCP server | `deploy/mcp-server.Dockerfile` | 8787 | Yes: `/mcp` needs a bearer token |
| Web (simulator `/`, family page `/family`) | `deploy/web.Dockerfile` | 8080 | Yes, behind `WEB_PASSWORD` |
| Worker | `deploy/worker.Dockerfile` | — | No |

Optionally the extract agent runs on **Bedrock AgentCore Runtime** instead of inside the worker
(`deploy/agentcore.Dockerfile`, below).

## Environment

Generate two long random tokens (`openssl rand -hex 24`), different from each other.

| Variable | MCP server | Web | Worker | AgentCore |
|---|---|---|---|---|
| `FALKORDB_URL` (`redis://<private host>:6379`) | ✓ | | ✓ | |
| `ELDER_TOKEN`, `FAMILY_TOKEN` | ✓ | ✓ | | |
| `MCP_SERVER_URL` (`https://<mcp host>/mcp`) | | ✓ | | |
| `WEB_PASSWORD` | | ✓ | | |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (IAM user, not root) | if SNS | ✓ | ✓ | role |
| `BEDROCK_CHAT_MODEL_ID` | | ✓ | | |
| `BEDROCK_EXTRACT_MODEL_ID` | | | ✓ (unless AgentCore) | ✓ |
| `AGENTCORE_RUNTIME_ARN` | | | optional | |
| `SNS_TOPIC_ARN` | optional | | | |
| `DEMO_CLOCK=1` (demo only) | ✓ | | | |

IAM permissions: `bedrock:InvokeModel` (web, worker or the AgentCore role),
`bedrock-agentcore:InvokeAgentRuntime` (worker, if used), `sns:Publish` (MCP server, if used).

Full-voice mode stores story audio in a folder shared by the web service and the worker
(`AUDIO_DIR`). On separate hosts that needs a shared volume or S3 with a short lifecycle rule;
without one, leave full-voice mode off in production (the simulator also deletes any audio older
than an hour).

## Railway

1. New project → add **FalkorDB** from the Docker image, with a volume; keep it private.
2. Add three services from this GitHub repo, each with its Dockerfile path set
   (`deploy/mcp-server.Dockerfile`, `deploy/web.Dockerfile`, `deploy/worker.Dockerfile`) and the
   variables above. Same region for all four.
3. Seed once: `FALKORDB_URL=<public proxy URL> pnpm seed` from a laptop, or a one-off Railway run.
4. Check: `MCP_SERVER_URL=https://<mcp host>/mcp ELDER_TOKEN=… pnpm test:latency`, then
   `npx -y github:yash4428/mcp-latency https://<mcp host>/mcp --token … --calls …`.

## Bedrock AgentCore Runtime (extract agent)

```bash
aws ecr create-repository --repository-name recollect-extract
docker buildx build --platform linux/arm64 -f deploy/agentcore.Dockerfile \
  -t <account>.dkr.ecr.<region>.amazonaws.com/recollect-extract:latest --push .
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name recollect_extract \
  --agent-runtime-artifact 'containerConfiguration={containerUri=<account>.dkr.ecr.<region>.amazonaws.com/recollect-extract:latest}' \
  --role-arn <role with bedrock:InvokeModel> \
  --network-configuration networkMode=PUBLIC \
  --environment-variables BEDROCK_EXTRACT_MODEL_ID=<model id>,AWS_REGION=<region>
```

Set the returned ARN as `AGENTCORE_RUNTIME_ARN` on the worker. The worker validates the answer
again before writing anything.

## Claude Desktop

Settings → Connectors → add a custom connector at `https://<mcp host>/mcp`. The server needs the
bearer token in the `Authorization` header; if the connector form cannot send one, put a small
authenticating proxy in front for the recording.
