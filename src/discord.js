import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder,
  GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder
} from 'discord.js';
import { config } from './config.js';

export const discordClient = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]
});

export function verificationPanelPayload() {
  const embed = new EmbedBuilder()
    .setTitle('YouTube Membership Verification')
    .setDescription([
      'Connect your Discord account and verify your active YouTube membership.',
      '',
      '**Verify Membership** — receive the correct role.',
      '**Check Status** — see your current membership status.',
      '**Recheck Membership** — force a fresh membership check.'
    ].join('\n'))
    .setFooter({text:'Membership roles are synced automatically.'});

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Verify Membership').setStyle(ButtonStyle.Link).setURL(`${config.baseUrl}/verify?mode=verify`),
    new ButtonBuilder().setLabel('Check Status').setStyle(ButtonStyle.Link).setURL(`${config.baseUrl}/verify?mode=status`),
    new ButtonBuilder().setLabel('Recheck Membership').setStyle(ButtonStyle.Link).setURL(`${config.baseUrl}/verify?mode=recheck`)
  );
  return {embeds:[embed],components:[row]};
}

async function registerCommands() {
  const commands=[
    new SlashCommandBuilder().setName('verify').setDescription('Open the YouTube membership verification panel'),
    new SlashCommandBuilder().setName('setup-verification').setDescription('Post the membership verification panel in this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ].map(c=>c.toJSON());
  const rest=new REST({version:'10'}).setToken(config.discord.token);
  await rest.put(Routes.applicationGuildCommands(config.discord.clientId,config.discord.guildId),{body:commands});
}

discordClient.once('ready',async()=>{
  console.log(`Discord logged in as ${discordClient.user.tag}`);
  try { await registerCommands(); console.log('Slash commands registered.'); }
  catch(e){ console.error('Command registration failed:',e); }
});

discordClient.on('interactionCreate',async interaction=>{
  if(!interaction.isChatInputCommand()) return;
  if(interaction.commandName==='verify'){
    await interaction.reply({...verificationPanelPayload(),ephemeral:true}); return;
  }
  if(interaction.commandName==='setup-verification'){
    if(!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)){
      await interaction.reply({content:'Administrator permission is required.',ephemeral:true}); return;
    }
    await interaction.channel.send(verificationPanelPayload());
    await interaction.reply({content:'Verification panel posted.',ephemeral:true});
  }
});

export async function startDiscord(){ if(!discordClient.isReady()) await discordClient.login(config.discord.token); }
export async function getGuild(){ if(!discordClient.isReady()) throw new Error('Discord bot is not ready yet.'); return discordClient.guilds.fetch(config.discord.guildId); }

export async function getGuildRoles(){
  const guild=await getGuild(), roles=await guild.roles.fetch();
  return [...roles.values()].filter(r=>r.id!==guild.id&&!r.managed).sort((a,b)=>b.position-a.position).map(r=>({id:r.id,name:r.name}));
}

export async function getTextChannels(){
  const guild=await getGuild(), channels=await guild.channels.fetch();
  return [...channels.values()].filter(c=>c&&c.isTextBased()&&!c.isThread()).sort((a,b)=>a.rawPosition-b.rawPosition).map(c=>({id:c.id,name:c.name}));
}

export async function postVerificationPanel(channelId){
  const guild=await getGuild(), channel=await guild.channels.fetch(channelId);
  if(!channel?.isTextBased()) throw new Error('That channel is not a text channel.');
  return channel.send(verificationPanelPayload());
}

export async function setCreatorMappedRole(discordUserId,mappedRoleIds,desiredRoleId){
  const guild=await getGuild(), member=await guild.members.fetch(discordUserId);
  for(const roleId of mappedRoleIds){
    if(roleId!==desiredRoleId&&member.roles.cache.has(roleId)) await member.roles.remove(roleId);
  }
  if(desiredRoleId&&!member.roles.cache.has(desiredRoleId)) await member.roles.add(desiredRoleId);
}
