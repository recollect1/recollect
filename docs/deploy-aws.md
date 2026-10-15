# Deploying Recollect on AWS (what is running, 15 Oct 2026)

One EC2 host runs everything with Docker Compose; the extract agent can also run on Bedrock
AgentCore Runtime. Region `us-east-1`. Everything is tagged `project=recollect`.

| Piece | What | Notes |
|---|---|---|
| IAM user `recollect-deploy` | Deploys and operates Recollect (CLI profile `recollect`) | Inline policy `recollect-deploy`: EC2 in us-east-1, SSM Run Command and parameters, ECR, AgentCore, Bedrock invoke, `iam:PassRole` for the two roles below only. No IAM write access. |
| IAM role `recollect-ec2` (+ instance profile) | The server's own identity | Bedrock invoke, AgentCore invoke, read `/recollect/*` parameters, push to the `recollect-extract` ECR repo, SSM managed instance. The containers use it through IMDSv2 (hop limit 2): no AWS keys on the server. |
| IAM role `recollect-agentcore` | AgentCore Runtime execution role | Bedrock invoke, pull from `recollect-extract`, its own logs. |
| EC2 `recollect` | `t4g.small` (arm64), Amazon Linux 2023, 20 GB encrypted gp3, 4 GB swap | Security group `recollect-web`: ports 80 and 443 only. No SSH key: administered with SSM Run Command / Session Manager. |
| Elastic IP | 34.194.181.93 | Fixed, so the hostname survives stop/start. |
| Site | https://34-194-181-93.sslip.io | Caddy gets a Let's Encrypt certificate for the sslip.io name. `/mcp` and `/healthz` go to the MCP server (bearer token required); everything else is the web service (simulator `/`, family page `/family`) behind `WEB_PASSWORD`. |
| SSM parameter `/recollect/env` | SecureString: tokens, web password, model IDs | Generated on the deployer's laptop; a copy is in the git-ignored `.env.aws` there. |

Files: `deploy/aws/compose.yml`, `deploy/aws/Caddyfile`, `deploy/aws/bootstrap.sh`.

## Deploy or update

```bash
export AWS_PROFILE=recollect AWS_REGION=us-east-1
aws ssm send-command --instance-ids <instance-id> --document-name AWS-RunShellScript \
  --parameters 'commands=["bash /opt/recollect/deploy/aws/bootstrap.sh main 34-194-181-93.sslip.io"]'
```

`bootstrap.sh` installs Docker and Compose (first run only), pulls the commit, writes `.env` from
the parameter, builds the three images one at a time and restarts the stack. Seed once after the
first deploy (the radio story is left out so it can be told live in the demo):

```bash
docker compose -p recollect run --rm -e SEED_SKIP=radio mcp pnpm seed
```

## Costs and switching off

Roughly US$12/month for the instance, US$1.6 for the disk and US$3.6 for the public IPv4 address,
plus Bedrock calls (cents per demo). To pause: `aws ec2 stop-instances --instance-ids <id>` (the
disk and IP are still billed). To remove everything: terminate the instance, release the Elastic
IP, delete the security group, the `/recollect/env` parameter, the ECR repo and AgentCore runtime
if created, then the IAM roles, instance profile and user.
