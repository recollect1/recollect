# Recollect web: the Alexa+ simulator at / and the family page at /family, behind WEB_PASSWORD.
# Holds the MCP tokens and AWS keys; browsers never see them.
#   docker build -f deploy/web.Dockerfile -t recollect-web .
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @recollect/alexa-sim exec vite build \
 && pnpm --filter @recollect/family exec vite build
ENV NODE_ENV=production SIM_PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "@recollect/alexa-sim", "exec", "tsx", "server/index.ts"]
