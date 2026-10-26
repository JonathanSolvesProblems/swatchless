FROM node:22-slim
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Inlined into the browser bundle at build time: shows the access-code field on the desk.
ARG NEXT_PUBLIC_CONSULT_CODE_REQUIRED=1
ENV NEXT_PUBLIC_CONSULT_CODE_REQUIRED=$NEXT_PUBLIC_CONSULT_CODE_REQUIRED
# The public address, for absolute Open Graph URLs.
ARG SITE_URL=https://swatchless.fly.dev
ENV SITE_URL=$SITE_URL
RUN pnpm build

ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 CONSULT_DIR=/data/consults
EXPOSE 8080
CMD ["sh", "scripts/start.sh"]
