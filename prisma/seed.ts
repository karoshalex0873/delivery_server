import 'dotenv/config';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from 'node_modules/@prisma/adapter-pg/dist/index.mjs';
import * as argon2 from 'argon2';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

// Seed function to populate the database with initial data

async function main(): Promise<void> {
  try {
    const adminPasswordHash = await argon2.hash('Admin123');

    // 1) Roles
    await prisma.role.createMany({
      data: [
        { id: 1, name: 'customer' },
        { id: 2, name: 'rider' },
        { id: 3, name: 'restaurant' },
        { id: 4, name: 'admin' },
      ],
      skipDuplicates: true,
    });

    // 2) Admin user only
    await prisma.user.upsert({
      where: { email: 'admin@gmail.com' },
      update: {
        firstName: 'Admin',
        lastName: 'User',
        password: adminPasswordHash,
        authProvider: 'local',
        roleId: 4,
      },
      create: {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@gmail.com',
        password: adminPasswordHash,
        authProvider: 'local',
        roleId: 4,
      },
    });

    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
