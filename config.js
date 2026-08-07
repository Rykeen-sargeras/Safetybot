import express from 'express';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { createState, consumeState } from './oauth-state.js';
import { makeGoogleClient, getAuthorizedChannel } from './youtube.js';
import { syncCreator } from './sync.js';

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font-family:system-ui;max-width:760px;margin:50px auto;padding:0 20px;line-height:1.5}a,button{display:inline-block;padding:12px 18px;background:#5865f2;color:white;text-decoration:none;border:0;border-radius:8px}code{background:#eee;padding:2px 5px}</style></head><body><h1>${title}</h1>${body}</body></html>`;
}

export function createWebApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.get('/', (_req, res) => res.send(page('YouTube Membership Role Bot', `
    <p><a href="/link/discord">Link your Discord and YouTube connection</a></p>
    <p><a href="/creator/start">Connect a creator channel</a></p>
    <p>Health: <code>/health</code></p>`)));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/link/discord', async (_req, res, next) => {
    try {
      const state = await createState('discord');
      const params = new URLSearchParams({
        client_id: config.discord.clientId,
        response_type: 'code',
        redirect_uri: config.discord.redirectUri,
        scope: 'identify connections',
        state,
        prompt: 'consent'
      });
      res.redirect(`https://discord.com/oauth2/authorize?${params}`);
    } catch (error) { next(error); }
  });

  app.get('/auth/discord/callback', async (req, res, next) => {
    try {
      const savedState = await consumeState(req.query.state, 'discord');
      if (!savedState) return res.status(400).send(page('Invalid link', '<p>The authorization link expired. Start again.</p>'));

      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.discord.clientId,
          client_secret: config.discord.clientSecret,
          grant_type: 'authorization_code',
          code: req.query.code,
          redirect_uri: config.discord.redirectUri
        })
      });
      if (!tokenResponse.ok) throw new Error(`Discord token exchange failed: ${await tokenResponse.text()}`);
      const token = await tokenResponse.json();
      const headers = { Authorization: `Bearer ${token.access_token}` };
      const [userResponse, connectionsResponse] = await Promise.all([
        fetch('https://discord.com/api/v10/users/@me', { headers }),
        fetch('https://discord.com/api/v10/users/@me/connections', { headers })
      ]);
      const user = await userResponse.json();
      const connections = await connectionsResponse.json();
      const youtube = connections.find(connection => connection.type === 'youtube' && connection.verified !== false);
      if (!youtube) return res.status(400).send(page('YouTube not connected', '<p>Connect YouTube under Discord Settings → Connections, then try again.</p>'));

      await db.query(
        `INSERT INTO discord_users (discord_user_id, discord_username, youtube_channel_id, youtube_channel_name)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (discord_user_id) DO UPDATE SET discord_username=$2, youtube_channel_id=$3,
         youtube_channel_name=$4, linked_at=NOW()`,
        [user.id, user.global_name || user.username, youtube.id, youtube.name]
      );
      res.send(page('Account linked', `<p>Your Discord account is linked to YouTube channel <strong>${youtube.name}</strong>.</p>`));
    } catch (error) { next(error); }
  });

  app.get('/creator/start', async (req, res, next) => {
    try {
      const discordUserId = String(req.query.discord_user_id || 'OWNER_SETUP');
      const state = await createState('google', discordUserId);
      const auth = makeGoogleClient();
      const url = auth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [config.google.scope, 'https://www.googleapis.com/auth/youtube.readonly'],
        state
      });
      res.redirect(url);
    } catch (error) { next(error); }
  });

  app.get('/auth/google/callback', async (req, res, next) => {
    try {
      const savedState = await consumeState(req.query.state, 'google');
      if (!savedState) return res.status(400).send(page('Invalid link', '<p>The authorization link expired. Start again.</p>'));
      const auth = makeGoogleClient();
      const { tokens } = await auth.getToken(req.query.code);
      auth.setCredentials(tokens);
      if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Revoke the app in Google Account permissions and connect again.');
      const channel = await getAuthorizedChannel(auth);
      await db.query(
        `INSERT INTO creators (discord_user_id, youtube_channel_id, youtube_channel_name, access_token, refresh_token, token_expiry)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (youtube_channel_id) DO UPDATE SET discord_user_id=$1, youtube_channel_name=$3,
         access_token=$4, refresh_token=$5, token_expiry=$6, connected_at=NOW()`,
        [savedState.discord_user_id, channel.id, channel.name, tokens.access_token, tokens.refresh_token, tokens.expiry_date]
      );
      res.send(page('Creator connected', `<p><strong>${channel.name}</strong> is connected.</p><p>Next, add role mappings in PostgreSQL or build an admin page.</p>`));
    } catch (error) { next(error); }
  });

  app.post('/admin/map-role', async (req, res, next) => {
    try {
      const expected = crypto.createHash('sha256').update(config.sessionSecret).digest('hex');
      const supplied = crypto.createHash('sha256').update(String(req.headers['x-admin-key'] || '')).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return res.status(401).json({ error: 'Unauthorized' });
      const { creatorChannelId, youtubeLevelId, youtubeLevelName, discordRoleId } = req.body;
      await db.query(
        `INSERT INTO role_mappings (creator_channel_id, youtube_level_id, youtube_level_name, discord_role_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (creator_channel_id, youtube_level_id)
         DO UPDATE SET youtube_level_name=$3, discord_role_id=$4`,
        [creatorChannelId, youtubeLevelId, youtubeLevelName, discordRoleId]
      );
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.post('/admin/sync/:creatorChannelId', async (req, res, next) => {
    try {
      if (req.headers['x-admin-key'] !== config.sessionSecret) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await syncCreator(req.params.creatorChannelId));
    } catch (error) { next(error); }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).send(page('Something went wrong', `<p>${String(error.message || error)}</p>`));
  });
  return app;
}
