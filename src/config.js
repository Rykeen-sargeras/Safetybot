import 'dotenv/config';

const required = [
  'APP_BASE_URL','SESSION_SECRET','DISCORD_BOT_TOKEN','DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET','DISCORD_GUILD_ID','GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET','DATABASE_URL'
];
const missing = required.filter(k => !process.env[k]);
if (missing.length) throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);

const baseUrl = process.env.APP_BASE_URL.replace(/\/$/, '');

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl,
  sessionSecret: process.env.SESSION_SECRET,
  adminPassword: process.env.ADMIN_PASSWORD || 'THEmatchaman69420',
  databaseUrl: process.env.DATABASE_URL,
  mockMemberships: process.env.MOCK_YOUTUBE_MEMBERSHIPS === 'true',
  auditIntervalMinutes: Math.max(15, Number(process.env.AUDIT_INTERVAL_MINUTES || 360)),
  discord: {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    guildId: process.env.DISCORD_GUILD_ID,
    redirectUri: process.env.DISCORD_OAUTH_REDIRECT_URI || `${baseUrl}/auth/discord/callback`
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`,
    membershipScope: process.env.GOOGLE_YOUTUBE_SCOPE || 'https://www.googleapis.com/auth/youtube.channel-memberships.creator',
    readonlyScope: 'https://www.googleapis.com/auth/youtube.readonly'
  }
};
