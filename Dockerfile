# Base images pinned to digest (tag retained for readability). Dependabot keeps these current.
ARG NODE_BUILDER_VERSION=22-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2
ARG NODE_RUNTIME_VERSION=22-alpine@sha256:ab07539e0988b63558ff621f5fbe1077054c39d9809112974fb79993949d41cd

FROM node:${NODE_BUILDER_VERSION} AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

RUN pnpm build


FROM node:${NODE_RUNTIME_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8765

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
 && mkdir -p /home/node/.gitdeck \
 && chown -R node:node /home/node/.gitdeck /app

USER root

EXPOSE 8765
VOLUME ["/home/node/.gitdeck"]

ENTRYPOINT ["./docker-entrypoint.sh"]
