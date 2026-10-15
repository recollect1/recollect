# Recollect MCP server (Streamable HTTP, :8787). Build from the repo root:
#   docker build -f deploy/mcp-server.Dockerfile -t recollect-mcp .
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @recollect/ui-cards build
# Bake both local models (embedder + relevance check) into the image so boot is warm and offline.
RUN FALKORDB_URL= pnpm --filter @recollect/core exec tsx -e "import('./src/embed.ts').then(async (m) => { const e = await m.createEmbedder(); await e.dispose?.(); }); import('./src/rerank.ts').then(async (m) => { const r = await m.createReranker(); await r.dispose?.(); });"
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["pnpm", "--filter", "@recollect/mcp-server", "exec", "tsx", "src/main.ts"]
