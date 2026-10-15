# The extract agent for Amazon Bedrock AgentCore Runtime (arm64, serves :8080 /invocations, /ping).
#   docker buildx build --platform linux/arm64 -f deploy/agentcore.Dockerfile -t <ecr-repo>:latest --push .
# Runtime env: BEDROCK_EXTRACT_MODEL_ID, AWS_REGION, AGENTCORE_SELF=1. Execution role: bedrock:InvokeModel.
FROM --platform=linux/arm64 python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY agents/ agents/
COPY packages/core/src/trend-phrases.json packages/core/src/trend-phrases.json
WORKDIR /app/agents
RUN uv sync --frozen --no-dev
ENV AGENTCORE_SELF=1
EXPOSE 8080
CMD ["uv", "run", "--no-dev", "python", "agentcore_app.py"]
