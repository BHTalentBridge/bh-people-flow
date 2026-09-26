/**
 * Seed: one Administrator, nothing else.
 *
 * Everything the app manages — service providers, clients, projects, modules,
 * teams, resources — is created through the UI by that Admin. The seed exists
 * only to give you a way in.
 *
 * It **wipes** every table first, so `npm run db:seed` always lands on the same
 * known state. Don't run it against data you want to keep.
 */
import { PrismaClient, ResourceType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@sh.com';
const ADMIN_NAME = 'Admin';
/** Override with SEED_ADMIN_PASSWORD when you don't want the documented default. */
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Password123!';

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
const colorFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

async function main() {
  // Order matters: children before parents, since most relations are Restrict
  // or would orphan rows.
  console.log('Clearing all data…');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.task.deleteMany(),
    prisma.overtimeRequest.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.assignmentRequest.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.resourceAssignment.deleteMany(),
    prisma.subModule.deleteMany(),
    prisma.module.deleteMany(),
    prisma.projectManager.deleteMany(),
    prisma.projectEngineeringManager.deleteMany(),
    prisma.project.deleteMany(),
    prisma.client.deleteMany(),
    prisma.resource.deleteMany(),
    prisma.user.deleteMany(),
    prisma.serviceProvider.deleteMany(),
  ]);

  console.log('Creating the Administrator…');
  const user = await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      avatarColor: colorFor(ADMIN_EMAIL),
    },
  });

  // An Admin's Resource profile is optional in the data model, but it's what
  // makes the account editable — the Resources screen is the only place access
  // levels, passwords and account status are managed, and it lists resources.
  // Without a profile this account could never be changed through the UI.
  await prisma.resource.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      employeeCode: 'SH-0001',
      designation: 'Administrator',
      type: ResourceType.SH,
      joinedAt: new Date(),
      userId: user.id,
    },
  });

  console.log('\n✔ Seed complete.\n');
  console.table([{ Role: 'Admin', Name: ADMIN_NAME, Email: ADMIN_EMAIL, Password: ADMIN_PASSWORD }]);
  console.log('\nEverything else is created in the app: add service providers and clients,');
  console.log('then projects, then people on the Resources screen.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
