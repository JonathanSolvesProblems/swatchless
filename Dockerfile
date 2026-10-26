FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Inlined into the browser bundle at build time: shows the access-code field on the desk.
ARG NEXT_PUBLIC_CONSULT_CODE_REQUIRED=1
ENV NEXT_PUBLIC_CONSULT_CODE_REQUIRED=$NEXT_PUBLIC_CONSULT_CODE_REQUIRED
# The public address, for absolute Open Graph URLs.
ARG SITE_URL=https://swatchless.jonathanandrei.com
ENV SITE_URL=$SITE_URL
RUN pnpm build

# Runtime: production dependencies and the build output only.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
COPY --from=build /app/seed ./seed
COPY --from=build /app/scripts/start.sh ./scripts/start.sh
COPY --from=build /app/next.config.ts ./next.config.ts
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 CONSULT_DIR=/data/consults
EXPOSE 8080
CMD ["sh", "scripts/start.sh"]
