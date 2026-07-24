import { onRequest } from 'firebase-functions/v2/https';
import { app } from './app.js';
import { initSchema } from './db/database.js';
export const api = onRequest({
    region: 'asia-east1',
    maxInstances: 10,
    minInstances: 0,
    concurrency: 80,
    timeoutSeconds: 300,
    memory: '256MiB',
}, async (req, res) => {
    await initSchema();
    app(req, res);
});
//# sourceMappingURL=index.js.map