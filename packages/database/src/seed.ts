import { allowSyntheticContent } from './package-runtime.js';
import { eq } from 'drizzle-orm';
import { closeDatabaseConnection, getDatabase } from './client.js';
import { schools, users } from './schema/index.js';
import { seedDemoLearning } from './demo-learning.js';

const ids = {
  adminAuth: '00000000-0000-4000-8000-000000000001',
  teacherAuth: '00000000-0000-4000-8000-000000000002',
  studentAuth: '00000000-0000-4000-8000-000000000003',
};

async function seed() {
  if (!allowSyntheticContent())
    throw new Error('Isolated development/test fixture opt-in required.');
  const { db } = getDatabase();
  if (process.argv.includes('--learning-only')) {
    await db.transaction(async (tx) => seedDemoLearning(tx));
    console.log('Seeded DEMO learning content only; no identity fixtures created.');
    await closeDatabaseConnection();
    return;
  }

  // Placeholder Auth IDs cannot sign in through the shared cloud Auth project.
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
    throw new Error(
      'Identity demo fixtures are restricted to localhost. Use db:seed:learning for cloud sandbox.',
    );
  }

  await db
    .insert(schools)
    .values({ code: 'DEMO-SCHOOL', name: 'SMP Nusantara' })
    .onConflictDoNothing({ target: schools.code });

  const demoUsers = [
    {
      authUserId: ids.adminAuth,
      role: 'ADMIN' as const,
      adminRole: 'SUPER_ADMIN' as const,
      displayName: 'Dian Prasetyo',
      email: 'admin.demo@example.invalid',
    },
    {
      authUserId: ids.teacherAuth,
      role: 'TEACHER' as const,
      displayName: 'Ratna Sari',
      email: 'teacher.demo@example.invalid',
    },
    {
      authUserId: ids.studentAuth,
      role: 'STUDENT' as const,
      displayName: 'Alya Putri',
      email: 'student.demo@example.invalid',
    },
  ];

  for (const user of demoUsers) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authUserId, user.authUserId));
    if (existing.length === 0) {
      await db.insert(users).values(user);
    }
  }

  console.log('Seeded deterministic DEMO identity fixtures.');
  await seedDemoLearning();
  console.log('Seeded DEMO Level 1 question variants and packages.');
  await closeDatabaseConnection();
}

seed().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Demo seed failed.');
  await closeDatabaseConnection();
  process.exit(1);
});
