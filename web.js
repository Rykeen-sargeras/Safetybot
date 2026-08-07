import { db } from './db.js';
import { makeGoogleClient, getActiveMembers } from './youtube.js';
import { setMemberRole } from './discord.js';

export async function syncCreator(creatorChannelId) {
  const creatorResult = await db.query('SELECT * FROM creators WHERE youtube_channel_id = $1', [creatorChannelId]);
  const creator = creatorResult.rows[0];
  if (!creator) throw new Error('Creator is not connected.');

  const auth = makeGoogleClient();
  auth.setCredentials({
    access_token: creator.access_token,
    refresh_token: creator.refresh_token,
    expiry_date: creator.token_expiry ? Number(creator.token_expiry) : undefined
  });

  auth.on('tokens', async tokens => {
    await db.query(
      `UPDATE creators SET access_token = COALESCE($1, access_token),
       refresh_token = COALESCE($2, refresh_token), token_expiry = COALESCE($3, token_expiry)
       WHERE youtube_channel_id = $4`,
      [tokens.access_token, tokens.refresh_token, tokens.expiry_date, creatorChannelId]
    );
  });

  const members = await getActiveMembers(auth);
  const activeByChannel = new Map();
  for (const item of members) {
    const memberChannelId = item.snippet?.memberDetails?.channelId;
    const levelId = item.snippet?.membershipsDetails?.highestAccessibleLevel;
    if (memberChannelId && levelId) activeByChannel.set(memberChannelId, levelId);
  }

  const mappings = (await db.query('SELECT * FROM role_mappings WHERE creator_channel_id = $1', [creatorChannelId])).rows;
  const linkedUsers = (await db.query('SELECT * FROM discord_users WHERE youtube_channel_id IS NOT NULL')).rows;

  let changes = 0;
  for (const user of linkedUsers) {
    const activeLevel = activeByChannel.get(user.youtube_channel_id);
    for (const mapping of mappings) {
      const shouldHave = activeLevel === mapping.youtube_level_id;
      await setMemberRole(user.discord_user_id, mapping.discord_role_id, shouldHave);
      changes++;
    }
  }
  return { checkedMembers: members.length, checkedDiscordUsers: linkedUsers.length, roleChecks: changes };
}
