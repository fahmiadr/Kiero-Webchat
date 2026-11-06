import { buildApp } from './app.js';
import { config } from './config/index.js';

const start = async () => {
    try {
        const app = await buildApp();
        app.listen({ port: config.port, host: '0.0.0.0' });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();
