/**
 * Idempotent Administrator bootstrap — safe to run on a live database.
 *
 * `prisma/seed.ts` **wipes every table** before creating its admin, which is
 * right for local development and catastrophic against a deployed environment.
 * This script only ever adds what's missing:
 *
 *  - creates the Admin login if that email has none
 *  - leaves an existing account's password, role and profile untouched
 *  - attaches a Resource profile only if the account has none
 *
 * Run it once after the first deploy:
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run db:ensure-admin
 */
import { PrismaClient, ResourceType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@sh.com').toLowerCase().trim();
const NAME = process.env.SEED_ADMIN_NAME || 'Admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Password123!';

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
const colorFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

/** First free SH-#### code, so we never collide with existing people. */
async function nextEmployeeCode() {
  const taken = new Set(
    (await prisma.resource.findMany({ select: { employeeCode: true } })).map((r) => r.employeeCode),
  );
  for (let n = 1; n < 10_000; n++) {
    const code = `SH-${String(n).padStart(4, '0')}`;
    if (!taken.has(code)) return code;
  }
  return `SH-${Date.now()}`;
}

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { resource: { select: { id: true } } },
  });

  if (existing) {
    console.log(`✔ ${EMAIL} already exists (role ${existing.role}) — password and profile left as they are.`);
    if (!existing.resource) {
      const resource = await prisma.resource.create({
        data: {
          name: existing.name,
          email: EMAIL,
          employeeCode: await nextEmployeeCode(),
          designation: 'Administrator',
          type: ResourceType.SH,
          joinedAt: new Date(),
          userId: existing.id,
        },
      });
      console.log(`  + attached a Resource profile (${resource.employeeCode}) so the account is editable in the UI.`);
    }
    return;
  }

  const user = await prisma.user.create({
    data: {
      name: NAME,
      email: EMAIL,
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      avatarColor: colorFor(EMAIL),
    },
  });
  const resource = await prisma.resource.create({
    data: {
      name: NAME,
      email: EMAIL,
      employeeCode: await nextEmployeeCode(),
      designation: 'Administrator',
      type: ResourceType.SH,
      joinedAt: new Date(),
      userId: user.id,
    },
  });
  console.log(`✔ Created Administrator ${EMAIL} (${resource.employeeCode}).`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('  ! Using the default password — change it after signing in.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
