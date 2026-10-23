#!/bin/bash
# A second local stack on spare ports (MCP 8797, simulator 5183 + backend 8798, family 5184), so a
# branch can be tried beside the usual `pnpm dev` (8787/5173/8788/5174). In-memory graph; uses .env.
set -e
cd "$(dirname "$0")/.."
export PORT=8797 SIM_PORT=8798 MCP_SERVER_URL=http://localhost:8797/mcp
pnpm --filter @recollect/ui-cards build >/dev/null
(cd apps/mcp-server && pnpm exec tsx --env-file-if-exists=../../.env src/main.ts) &
(cd apps/alexa-sim && pnpm exec tsx --env-file-if-exists=../../.env server/index.ts) &
(cd apps/alexa-sim && pnpm exec vite --port 5183 --strictPort) &
(cd apps/family && pnpm exec vite --port 5184 --strictPort) &
wait
