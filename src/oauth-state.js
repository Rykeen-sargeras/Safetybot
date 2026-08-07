import crypto from 'node:crypto';
import { db } from './db.js';

export async function createState(provider, context = null) {
  const state = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO oauth_states (state, provider, context, expires_at)
     VALUES ($1,$2,$3,NOW()+INTERVAL '15 minutes')`,
    [state, provider, context]
  );
  return state;
}

export async function consumeState(state) {
  const r = await db.query(
    `DELETE FROM oauth_states WHERE state=$1 AND expires_at>NOW() RETURNING provider, context`,
    [state]
  );
  return r.rows[0] || null;
}
