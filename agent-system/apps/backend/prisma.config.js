import { defineConfig } from '@prisma/config';
import { config } from './src/config/index.js';

export default defineConfig({
    migrations: {
        seed: 'node prisma/seed.js',
    },
    datasource: {
        url: config.databaseUrl,
    },
});