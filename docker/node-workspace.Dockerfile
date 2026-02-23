FROM node:20-bookworm-slim AS node-base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM node-base AS workspace-deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @apps/api-gateway prisma:generate

FROM node-base AS api-gateway-runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable
COPY --from=workspace-deps /workspace /workspace
EXPOSE 3000
CMD ["sh", "-lc", "until pnpm --filter @apps/api-gateway prisma:push; do echo 'api-gateway waiting for postgres...'; sleep 2; done && pnpm --filter @apps/api-gateway exec tsx src/main.ts"]

FROM node-base AS worker-orchestrator-runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable
COPY --from=workspace-deps /workspace /workspace
CMD ["sh", "-lc", "until node -e \"const req=require('http').request({hostname:'api-gateway',port:3000,path:'/v1/auth/wechat-login',method:'POST',headers:{'content-type':'application/json'}},(res)=>process.exit(res.statusCode && res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1));req.on('error',()=>process.exit(1));req.end(JSON.stringify({code:'admin',username:'admin',password:'admin123'}));\"; do echo 'worker-orchestrator waiting for api-gateway health...'; sleep 2; done && pnpm --filter @apps/worker-orchestrator exec tsx src/main.ts"]

FROM node-base AS webhook-dispatcher-runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable
COPY --from=workspace-deps /workspace /workspace
CMD ["pnpm", "--filter", "@apps/webhook-dispatcher", "exec", "tsx", "src/main.ts"]
