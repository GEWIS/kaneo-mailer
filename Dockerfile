FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./

FROM base AS builder
RUN yarn install --immutable
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build

FROM base AS deps
RUN yarn workspaces focus --production

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Europe/Amsterdam
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
USER node
CMD ["node", "dist/index.js"]
