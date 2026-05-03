import { PrismaClient } from '@prisma/client';

/**
 * Idempotent actor-seed. Ensures the demo `Tenant` + the
 * pre-auth shim `demo-user` row exist on every deploy so the
 * audit middleware's `actorId` FK is always satisfiable.
 *
 * Why a separate script from `seed.ts`:
 *   - `seed.ts` also rebuilds the demo Parkview property +
 *     contacts; running it on every deploy would clobber any
 *     edits operators made through the UI.
 *   - This script is the minimum needed for writes to succeed.
 *     Safe to run on every deploy; no destructive side-effects.
 *
 * Wired into `railway.json` preDeployCommand alongside
 * `prisma migrate deploy`. If the swap to NextAuth/Clerk lands,
 * this file becomes obsolete + can be deleted in the same PR
 * that drops the `process.env.USER_DEFAULT_ID` constant in
 * `actor-context.middleware.ts`.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tenantId = process.env.TENANT_DEFAULT_ID ?? 'demo';
    const actorId = process.env.USER_DEFAULT_ID ?? 'demo-user';

    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: 'Demo Tenant' },
    });

    await prisma.user.upsert({
      where: { id: actorId },
      update: {},
      create: {
        id: actorId,
        tenantId,
        name: 'Demo User',
        email: 'demo@example.com',
      },
    });

    console.log(`seed-actor: ensured tenant=${tenantId} actor=${actorId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('seed-actor.failed', err);
  process.exit(1);
});
