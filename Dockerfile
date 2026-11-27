# The docs site (`npm run docs`) served by nginx; .github/workflows/docs.yml builds it and deploys it to CapRover.
FROM node:26-slim AS build
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile
COPY . .
# nginx's gzip_static serves these, so the 20 MB playground wasm isn't compressed again on every request.
RUN npm run docs && find dist/docs -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.json' -o -name '*.txt' -o -name '*.md' -o -name '*.wasm' \) -exec gzip -9 -k {} +

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/docs /usr/share/nginx/html
