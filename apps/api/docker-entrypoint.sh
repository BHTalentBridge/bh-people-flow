#!/bin/sh
# Apply pending migrations and ensure initial admin exists, then hand off to the container's command.
#
# `prisma migrate deploy` is idempotent and never resets, so running it on every
# start is safe. `set -e` turns a failed migration into a failed container
# rather than an API quietly serving against a stale schema.
#
# `db:ensure-admin` is idempotent — it creates the administrator account only
# if missing, and never modifies existing passwords, roles, or profiles.
set -e

echo "==> Applying database migrations"
npm run prisma:deploy -w @sh-hrms/api

echo "==> Ensuring administrator account exists"
npm run db:ensure-admin -w @sh-hrms/api

exec "$@"
