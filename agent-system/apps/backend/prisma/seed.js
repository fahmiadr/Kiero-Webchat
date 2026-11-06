import prisma from '../src/config/prismaClient.js';
import { hash, encrypt } from '../src/utils/security.js';

async function main() {
    console.log('Seeding database...');

    // 0. Seed Agent User (Admin)
    const adminEmail = 'admin@kiero.id';
    const adminPassword = await hash('password123');

    await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            password: adminPassword // Update password if user exists to ensure valid hash
        },
        create: {
            email: adminEmail,
            name: 'Admin Agent',
            password: adminPassword,
            role: 'admin'
        }
    });

    const agent2Email = 'agent2@kiero.id';
    const agentPassword = await hash('password123');

    await prisma.user.upsert({
        where: { email: agent2Email },
        update: {
            password: agentPassword
        },
        create: {
            email: agent2Email,
            name: 'Agent Two',
            password: agentPassword,
            role: 'agent'
        }
    });
    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

