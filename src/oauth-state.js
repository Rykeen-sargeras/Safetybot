import crypto from 'node:crypto';
import { db } from './db.js';
export async function createState(provider, discordUserId = null) {
  const state = crypto.randomBytes(32).toString('hex');
  await db.query(`INSERT INTO oauth_states (state, provider, discord_user_id, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`, [state, provider, discordUserId]);
  return state;
}
export async function consumeState(state, provider) {
  const result = await db.query(`DELETE FROM oauth_states WHERE state = $1 AND provider = $2 AND expires_at > NOW() RETURNING discord_user_id`, [state, provider]);
  return result.rows[0] || null;
}
