import fs from 'node:fs/promises';
import { db } from './db.js';
import { config } from './config.js';
import { createWebApp } from './web.js';
import { startDiscord } from './discord.js';

// Start the web server immediately so Railway's /health check can succeed.
const app = createWebApp();
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Web server listening on port ${config.port}`);
});

// Initialize external services after the web port is open.
async function initializeServices() {
  try {
    const schema = await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
    await db.query(schema);
    console.log('Database initialized.');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }

  try {
    await startDiscord();
  } catch (error) {
    console.error('Discord login failed:', error);
  }
}

initializeServices();

async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    try {
      await db.end();
    } finally {
      process.exit(0);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
