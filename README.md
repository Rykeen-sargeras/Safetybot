CREATE TABLE IF NOT EXISTS discord_users (
  discord_user_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  youtube_channel_id TEXT,
  youtube_channel_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creators (
  id BIGSERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  youtube_channel_id TEXT NOT NULL UNIQUE,
  youtube_channel_name TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  token_expiry BIGINT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  discord_user_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS discord_users_youtube_idx
  ON discord_users (youtube_channel_id);
