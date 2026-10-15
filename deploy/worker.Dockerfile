# Recollect background agent worker (Strands on Bedrock + speech markers). Plain-process fallback
# for AgentCore (§3). Build from the repo root:
#   docker build -f deploy/worker.Dockerfile -t recollect-worker .
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY agents/ agents/
COPY packages/core/src/trend-phrases.json packages/core/src/trend-phrases.json
WORKDIR /app/agents
RUN uv sync --frozen --no-dev
CMD ["uv", "run", "--no-dev", "python", "-m", "worker"]
