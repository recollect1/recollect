# Deploying Recollect on AWS (what is running, 16 Oct 2026)

One EC2 host runs everything with Docker Compose; the extract agent can also run on Bedrock
AgentCore Runtime. Region `us-east-1`. Everything is tagged `project=recollect`.

| Piece | What | Notes |
|---|---|---|
| IAM user `recollect-deploy` | Deploys and operates Recollect (CLI profile `recollect`) | Inline policy `recollect-deploy`: EC2 in us-east-1, SSM Run Command and parameters, ECR, AgentCore, Bedrock invoke, `iam:PassRole` for the two roles below only, and `iam:CreateServiceLinkedRole` for AgentCore's services only. No other IAM write access. |
| IAM role `recollect-ec2` (+ instance profile) | The server's own identity | Bedrock invoke, AgentCore invoke, read `/recollect/*` parameters, push to the `recollect-extract` ECR repo, SSM managed instance. The containers use it through IMDSv2 (hop limit 2): no AWS keys on the server. |
| IAM role `recollect-agentcore` | AgentCore Runtime execution role | Bedrock invoke, pull from `recollect-extract`, its own logs. |
| EC2 `recollect` | `t4g.small` (arm64), Amazon Linux 2023, 20 GB encrypted gp3, 4 GB swap | Security group `recollect-web`: ports 80 and 443 only. No SSH key: administered with SSM Run Command / Session Manager. |
| Elastic IP | 34.194.181.93 | Fixed, so the hostname survives stop/start. |
| Site | https://34-194-181-93.sslip.io | Caddy gets a Let's Encrypt certificate for the sslip.io name. `/mcp` and `/healthz` go to the MCP server (bearer token required); everything else is the web service (simulator `/`, family page `/family`) behind `WEB_PASSWORD`. |
| SSM parameter `/recollect/env` | SecureString: tokens, web password, model IDs, AgentCore ARN | Generated on the deployer's laptop; a copy is in the git-ignored `.env.aws` there. |
| ECR `recollect-extract` | The extract agent's arm64 image | Built on the EC2 host (arm64), tagged with the commit. |
| AgentCore runtime `recollect_extract` | The Strands extract agent on Nova Pro | `arn:aws:bedrock-agentcore:us-east-1:615143732705:runtime/recollect_extract-XNrAL4AqoV`, role `recollect-agentcore`. The worker reuses one session (renewed hourly): 1–3 s per sentence. |

Files: `deploy/aws/compose.yml`, `deploy/aws/Caddyfile`, `deploy/aws/bootstrap.sh`.

## Deploy or update

```bash
export AWS_PROFILE=recollect AWS_REGION=us-east-1
aws ssm send-command --instance-ids i-02206a9bd8b3d5b9f --document-name AWS-RunShellScript \
  --parameters 'commands=["bash /opt/recollect/deploy/aws/bootstrap.sh main 34-194-181-93.sslip.io"]'
```

`bootstrap.sh` installs Docker and Compose (first run only), pulls the commit, writes `.env` from
the parameter, builds the three images one at a time and restarts the stack. Seed once after the
first deploy (the radio story is left out so it can be told live in the demo):

```bash
cd /opt/recollect/deploy/aws
docker compose --env-file .env -p recollect run --rm -e SEED_SKIP=radio mcp pnpm seed
docker compose --env-file .env -p recollect restart mcp   # reload the recall index
```

## AgentCore image update

```bash
# on the host (through SSM), then point the runtime at the new tag
REPO=615143732705.dkr.ecr.us-east-1.amazonaws.com/recollect-extract; TAG=$(git -C /opt/recollect rev-parse --short HEAD)
aws ecr get-login-password | docker login --username AWS --password-stdin ${REPO%%/*}
docker build -f /opt/recollect/deploy/agentcore.Dockerfile -t $REPO:$TAG /opt/recollect && docker push $REPO:$TAG
aws bedrock-agentcore-control update-agent-runtime --agent-runtime-id recollect_extract-XNrAL4AqoV   --agent-runtime-artifact "containerConfiguration={containerUri=$REPO:$TAG}"   --role-arn arn:aws:iam::615143732705:role/recollect-agentcore --network-configuration networkMode=PUBLIC
```

## Checked on 16 Oct

- `https://34-194-181-93.sslip.io/healthz` → `{"ok":true,…}`; `/` answers 401 without the password.
- Scenario C through the public MCP endpoint: the radio story was saved in 8 ms (server) and the worker,
  through AgentCore and Nova Pro, linked it to her father, Patiala, the radio and 1968 in about 8 s.
- Trends on the live graph (`python -m trends --graph` in the worker container) wrote the card.
- `pnpm test:latency` from inside AWS against the public URL: passes (README, Latency).
- After every test the graph was re-seeded with `SEED_SKIP=radio`, so the radio story can be told live.

## Costs and switching off

Roughly US$12/month for the instance, US$1.6 for the disk and US$3.6 for the public IPv4 address,
plus Bedrock calls (cents per demo). To pause: `aws ec2 stop-instances --instance-ids i-02206a9bd8b3d5b9f` (the
disk and IP are still billed). To remove everything: terminate the instance, release the Elastic
IP, delete the security group, the `/recollect/env` parameter, the ECR repo and AgentCore runtime
if created, then the IAM roles, instance profile and user.
