# syntax=docker/dockerfile:1

# The build context is the REPO ROOT — see apps/api/Dockerfile for why.

# -------------------------------------------------------------- build -------
FROM public.ecr.aws/docker/library/node:26.7.0-alpine3.23 AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY apps/web apps/web

# VITE_API_URL is deliberately left unset. nginx serves this bundle and proxies
# /api to the API container, so the browser only ever talks to one origin and
# the app's `/api` default is correct. Vite inlines the value at BUILD time, so
# setting it here would bake a hostname into the bundle that only a rebuild
# could change.
RUN npm run build -w @sh-hrms/web

# ------------------------------------------------------------ runtime -------
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
