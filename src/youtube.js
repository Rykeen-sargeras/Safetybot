import { google } from 'googleapis';
import { config } from './config.js';
import { db } from './db.js';

export function makeGoogleClient() {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export function makeCreatorClient(creator) {
  const auth = makeGoogleClient();
  auth.setCredentials({
    access_token: creator.access_token || undefined,
    refresh_token: creator.refresh_token,
    expiry_date: creator.token_expiry ? Number(creator.token_expiry) : undefined
  });
  auth.on('tokens', async tokens => {
    try {
      await db.query(
        `UPDATE creators SET access_token=COALESCE($1,access_token),
         refresh_token=COALESCE($2,refresh_token), token_expiry=COALESCE($3,token_expiry)
         WHERE youtube_channel_id=$4`,
        [tokens.access_token||null,tokens.refresh_token||null,tokens.expiry_date||null,creator.youtube_channel_id]
      );
    } catch (e) { console.error('Token save failed:', e); }
  });
  return auth;
}

export async function getAuthorizedChannel(auth) {
  const youtube = google.youtube({version:'v3',auth});
  const r = await youtube.channels.list({part:['snippet'], mine:true});
  const c = r.data.items?.[0];
  if (!c?.id) throw new Error('No YouTube channel was found for this Google account.');
  return {id:c.id,name:c.snippet?.title||c.id};
}

export async function getMembershipLevels(auth) {
  if (config.mockMemberships) return [{id:'mock-level-1',name:'Member'},{id:'mock-level-2',name:'VIP'}];
  const youtube = google.youtube({version:'v3',auth});
  const r = await youtube.membershipsLevels.list({part:['snippet']});
  return (r.data.items||[]).map(i=>({id:i.id,name:i.snippet?.levelName||i.id}));
}

export async function getActiveMembers(auth) {
  if (config.mockMemberships) return [];
  const youtube = google.youtube({version:'v3',auth});
  const members=[]; let pageToken;
  do {
    const r = await youtube.members.list({
      part:['snippet'], mode:'all_current', maxResults:100, pageToken
    });
    for (const item of r.data.items||[]) {
      const d=item.snippet?.membershipsDetails, m=item.snippet?.memberDetails;
      if (m?.channelId) members.push({
        channelId:m.channelId,
        displayName:m.displayName||m.channelId,
        levelId:d?.highestAccessibleLevel||null,
        memberSince:d?.memberSince||null
      });
    }
    pageToken=r.data.nextPageToken;
  } while(pageToken);
  return members;
}
