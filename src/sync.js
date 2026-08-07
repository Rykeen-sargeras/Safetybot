import { db } from './db.js';
import { getActiveMembers, makeCreatorClient } from './youtube.js';
import { setCreatorMappedRole } from './discord.js';

async function mappingsFor(channelId){
  const r=await db.query(
    `SELECT youtube_level_id,youtube_level_name,discord_role_id FROM role_mappings WHERE creator_channel_id=$1`,
    [channelId]
  );
  return r.rows;
}

async function apply({discordUser,creator,activeMember,mappings}){
  const allRoles=mappings.map(m=>m.discord_role_id);
  const desired=activeMember?mappings.find(m=>m.youtube_level_id===activeMember.levelId):null;

  if(activeMember&&desired){
    await setCreatorMappedRole(discordUser.discord_user_id,allRoles,desired.discord_role_id);
    await db.query(
      `INSERT INTO membership_status
       (discord_user_id,creator_channel_id,youtube_level_id,discord_role_id,is_active,last_active_at,grace_expires_at,last_checked_at)
       VALUES($1,$2,$3,$4,TRUE,NOW(),NULL,NOW())
       ON CONFLICT(discord_user_id,creator_channel_id) DO UPDATE SET
       youtube_level_id=EXCLUDED.youtube_level_id,discord_role_id=EXCLUDED.discord_role_id,
       is_active=TRUE,last_active_at=NOW(),grace_expires_at=NULL,last_checked_at=NOW()`,
      [discordUser.discord_user_id,creator.youtube_channel_id,activeMember.levelId,desired.discord_role_id]
    );
    return {creator:creator.youtube_channel_name,status:'active',level:desired.youtube_level_name};
  }

  const prev=(await db.query(
    `SELECT * FROM membership_status WHERE discord_user_id=$1 AND creator_channel_id=$2`,
    [discordUser.discord_user_id,creator.youtube_channel_id]
  )).rows[0];

  if(prev?.last_active_at){
    let expiry=prev.grace_expires_at?new Date(prev.grace_expires_at):null;
    if(!expiry){
      expiry=new Date(Date.now()+Number(creator.grace_period_days||0)*86400000);
      await db.query(
        `UPDATE membership_status SET is_active=FALSE,grace_expires_at=$3,last_checked_at=NOW()
         WHERE discord_user_id=$1 AND creator_channel_id=$2`,
        [discordUser.discord_user_id,creator.youtube_channel_id,expiry]
      );
    }
    if(expiry.getTime()>Date.now()){
      return {creator:creator.youtube_channel_name,status:'grace',graceExpiresAt:expiry.toISOString()};
    }
  }

  await setCreatorMappedRole(discordUser.discord_user_id,allRoles,null);
  await db.query(
    `INSERT INTO membership_status(discord_user_id,creator_channel_id,is_active,last_checked_at)
     VALUES($1,$2,FALSE,NOW())
     ON CONFLICT(discord_user_id,creator_channel_id) DO UPDATE SET
     is_active=FALSE,youtube_level_id=NULL,discord_role_id=NULL,last_checked_at=NOW()`,
    [discordUser.discord_user_id,creator.youtube_channel_id]
  );
  return {creator:creator.youtube_channel_name,status:'inactive'};
}

export async function syncUserMembership(discordUserId){
  const discordUser=(await db.query(`SELECT * FROM discord_users WHERE discord_user_id=$1`,[discordUserId])).rows[0];
  if(!discordUser?.youtube_channel_id) throw new Error('This Discord account does not have a linked YouTube connection.');

  const creators=(await db.query(`SELECT * FROM creators WHERE active=TRUE ORDER BY youtube_channel_name`)).rows;
  const results=[];
  for(const creator of creators){
    try{
      const members=await getActiveMembers(makeCreatorClient(creator));
      const activeMember=members.find(m=>m.channelId===discordUser.youtube_channel_id);
      results.push(await apply({discordUser,creator,activeMember,mappings:await mappingsFor(creator.youtube_channel_id)}));
    }catch(e){
      console.error(`Sync failed for ${creator.youtube_channel_name}:`,e);
      results.push({creator:creator.youtube_channel_name,status:'error',error:e.message});
    }
  }
  await db.query(`UPDATE discord_users SET last_verified_at=NOW() WHERE discord_user_id=$1`,[discordUserId]);
  return results;
}

export async function syncCreator(channelId){
  const creator=(await db.query(`SELECT * FROM creators WHERE youtube_channel_id=$1`,[channelId])).rows[0];
  if(!creator) throw new Error('Creator not found.');
  if(!creator.active) return {creator:creator.youtube_channel_name,skipped:true};

  const members=await getActiveMembers(makeCreatorClient(creator));
  const byId=new Map(members.map(m=>[m.channelId,m]));
  const mappings=await mappingsFor(creator.youtube_channel_id);
  const users=(await db.query(`SELECT * FROM discord_users WHERE youtube_channel_id IS NOT NULL`)).rows;
  let processed=0,errors=0;
  for(const discordUser of users){
    try{
      await apply({discordUser,creator,activeMember:byId.get(discordUser.youtube_channel_id),mappings});
      processed++;
    }catch(e){ errors++; console.error('Creator audit user error:',e); }
  }
  return {creator:creator.youtube_channel_name,processed,errors};
}

export async function syncAllCreators(){
  const rows=(await db.query(`SELECT youtube_channel_id FROM creators WHERE active=TRUE`)).rows;
  const out=[];
  for(const row of rows){
    try{ out.push(await syncCreator(row.youtube_channel_id)); }
    catch(e){ out.push({creatorChannelId:row.youtube_channel_id,error:e.message}); }
  }
  return out;
}
