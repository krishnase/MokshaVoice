import { buildApp, buildSocketIO } from './app.js';
import { env } from './lib/env.js';
import { startWorkers } from './workers/index.js';

async function main() {
  const app = await buildApp();
  await buildSocketIO(app);
  await startWorkers();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(`MokshaVoice API listening on port ${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
