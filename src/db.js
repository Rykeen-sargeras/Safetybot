import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;
export const db = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});
