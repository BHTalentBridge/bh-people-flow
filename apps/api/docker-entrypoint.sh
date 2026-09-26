#!/bin/sh
# Apply pending migrations, then hand off to the container's command.
#
# `prisma migrate deploy` is idempotent and never resets, so running it on every
# start is safe. `set -e` turns a failed migration into a failed container
# rather than an API quietly serving against a stale schema.
#
# It is deliberately NOT `db:seed` — that truncates every table. Create the
# first admin by hand:  docker compose exec api npm run db:ensure-admin
set -e

echo "==> Applying database migrations"
npm run prisma:deploy -w @sh-hrms/api

exec "$@"
