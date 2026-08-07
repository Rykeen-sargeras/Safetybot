CREATE TABLE IF NOT EXISTS discord_users (
  discord_user_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  youtube_channel_id TEXT,
  youtube_channel_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS creators (
  id BIGSERIAL PRIMARY KEY,
  youtube_channel_id TEXT NOT NULL UNIQUE,
  youtube_channel_name TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  token_expiry BIGINT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  grace_period_days INTEGER NOT NULL DEFAULT 3
);
CREATE TABLE IF NOT EXISTS role_mappings (
  id BIGSERIAL PRIMARY KEY,
  creator_channel_id TEXT NOT NULL,
  youtube_level_id TEXT NOT NULL,
  youtube_level_name TEXT NOT NULL,
  discord_role_id TEXT NOT NULL,
  UNIQUE (creator_channel_id, youtube_level_id)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  context TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS membership_status (
  discord_user_id TEXT NOT NULL,
  creator_channel_id TEXT NOT NULL,
  youtube_level_id TEXT,
  discord_role_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  last_active_at TIMESTAMPTZ,
  grace_expires_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_user_id, creator_channel_id)
);
