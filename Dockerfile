# syntax=docker/dockerfile:1

ARG APP_VERSION=0.0.0
ARG VITE_CAST_APP_ID=

FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_CAST_APP_ID
ENV VITE_CAST_APP_ID=$VITE_CAST_APP_ID

COPY package*.json ./
RUN npm ci && npm install --no-save @rollup/rollup-linux-x64-musl@4.64.0

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
RUN apk update && apk upgrade --no-cache
LABEL version=$APP_VERSION
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./

ENV APP_VERSION=$APP_VERSION
ENV STATIC_DIR=/app/dist
ENV MONGODB_URI=
ENV MONGODB_DB=jambo
ENV GOOGLE_CLIENT_ID=
ENV GOOGLE_CLIENT_SECRET=
ENV GOOGLE_REDIRECT_URI=
ENV APP_BASE_URL=
ENV VITE_CAST_APP_ID=

CMD ["npx", "tsx", "src/multiplayer/server.ts"]
