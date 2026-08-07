import { google } from 'googleapis';
import { config } from './config.js';

export function makeGoogleClient() {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export async function getAuthorizedChannel(auth) {
  const youtube = google.youtube({ version: 'v3', auth });
  const response = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channel = response.data.items?.[0];
  if (!channel?.id) throw new Error('No YouTube channel was found for this Google account.');
  return { id: channel.id, name: channel.snippet?.title || channel.id };
}

export async function getActiveMembers(auth) {
  if (config.mockMemberships) return [];
  const youtube = google.youtube({ version: 'v3', auth });
  const members = [];
  let pageToken;
  do {
    const response = await youtube.members.list({
      part: ['snippet'],
      mode: 'all_current',
      maxResults: 1000,
      pageToken
    });
    members.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return members;
}
