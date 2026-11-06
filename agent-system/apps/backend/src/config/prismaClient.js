import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from './index.js';

let prisma;

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const adapter = new PrismaPg(pool);

if (config.nodeEnv === 'production') {
    prisma = new PrismaClient({ adapter });
} else {
    if (!global.prisma) {
        global.prisma = new PrismaClient({ adapter });
    }
    prisma = global.prisma;
}

export default prisma;