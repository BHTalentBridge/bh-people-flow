# syntax=docker/dockerfile:1

# The build context is the REPO ROOT, not apps/api. npm workspaces resolve every
# dependency through the root package-lock.json, so a context scoped to one
# workspace cannot install.

# --------------------------------------------------------------- deps -------
FROM public.ecr.aws/docker/library/node:26.10.0-alpine3.24 AS deps
WORKDIR /app

# Prisma's query engine links against OpenSSL on musl.
RUN apk add --no-cache openssl

# Manifests first, so this layer stays cached until a dependency actually
# changes. Both workspace manifests are needed: npm ci validates the whole
# lockfile, not just the workspace being built.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# -------------------------------------------------------------- build -------
FROM deps AS build
WORKDIR /app
COPY apps/api apps/api
RUN npm run prisma:generate -w @sh-hrms/api \
 && npm run build -w @sh-hrms/api

# ------------------------------------------------------------ runtime -------
FROM public.ecr.aws/docker/library/node:26.10.0-alpine3.24 AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

# Dev dependencies stay in the image on purpose: `prisma migrate deploy` needs
# the Prisma CLI and `db:ensure-admin` needs ts-node, and both run against the
# live database rather than at build time. Pruning them would trade a smaller
# image for an API that can't migrate itself.
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "run", "start:prod", "-w", "@sh-hrms/api"]
