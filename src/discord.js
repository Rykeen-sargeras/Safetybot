import { Client, GatewayIntentBits, PermissionsBitField } from 'discord.js';
import { config } from './config.js';
export const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
export async function startDiscord() {
  discord.once('ready', () => console.log(`Discord bot logged in as ${discord.user.tag}`));
  await discord.login(config.discord.token);
}
export async function setMemberRole(discordUserId, roleId, shouldHaveRole) {
  const guild = await discord.guilds.fetch(config.discord.guildId);
  const member = await guild.members.fetch(discordUserId);
  const role = await guild.roles.fetch(roleId);
  if (!role) throw new Error(`Discord role ${roleId} was not found.`);
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) throw new Error('Bot is missing Manage Roles permission.');
  if (me.roles.highest.comparePositionTo(role) <= 0) throw new Error(`Bot role must be placed above ${role.name}.`);
  if (shouldHaveRole && !member.roles.cache.has(roleId)) await member.roles.add(role);
  if (!shouldHaveRole && member.roles.cache.has(roleId)) await member.roles.remove(role);
}
