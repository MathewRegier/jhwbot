'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, EmbedBuilder, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { listRooms, renderFeed } = require('./directory');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith('#') || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

loadEnv(path.join(__dirname, '..', '.env'));

const token = process.env.DISCORD_TOKEN || '';
const guildId = process.env.DISCORD_GUILD_ID || '';
const channelId = process.env.DISCORD_CHANNEL_ID || '';
const relayUrl = process.env.RELAY_URL || 'wss://web-production-79ef3.up.railway.app';
const pollMs = Math.min(120, Math.max(15, Number(process.env.POLL_SECONDS) || 20)) * 1000;
const stateFile = path.join(__dirname, '..', 'data', 'feed-message.json');

function required(name, value) {
  if (!value) throw Error('Set ' + name + ' before starting JHWBOT.');
}

function embedFrom(feed) {
  const embed = new EmbedBuilder()
    .setTitle(feed.title)
    .setDescription(feed.description)
    .setColor(feed.color)
    .setFooter(feed.footer);
  if (feed.fields.length) embed.addFields(feed.fields);
  return embed;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

async function publishFeed(channel, feed) {
  const signature = JSON.stringify({ title: feed.title, description: feed.description, fields: feed.fields, color: feed.color });
  const state = readState();
  if (state.channelId === channel.id && state.signature === signature && state.messageId) return;
  const payload = { embeds: [embedFrom(feed)] };
  let message = null;
  if (state.channelId === channel.id && state.messageId) {
    try { message = await channel.messages.fetch(state.messageId); } catch { message = null; }
  }
  if (message) await message.edit(payload);
  else message = await channel.send(payload);
  writeState({ channelId: channel.id, messageId: message.id, signature });
}

async function currentFeed() {
  try {
    const directory = await listRooms(relayUrl);
    return renderFeed({ rooms: directory.rooms });
  } catch (error) {
    return renderFeed({ error: error.message || 'Could not reach the multiplayer relay.' });
  }
}

const commands = [
  new SlashCommandBuilder().setName('servers').setDescription('Show the public Happy Wheels multiplayer rooms right now.').toJSON()
];

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(token);
  if (guildId) await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
  else await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
}

async function main() {
  required('DISCORD_TOKEN', token);
  required('DISCORD_CHANNEL_ID', channelId);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let timer = null;

  async function tick() {
    let channel;
    try { channel = await client.channels.fetch(channelId); }
    catch (error) {
      if (error.code === 50001 || error.message === 'Missing Access') throw Error('JHWBOT is not a member of that channel. In Server Settings, Integrations, JHWBOT must not say "This application does not have a bot in this server." Invite it again with the bot scope, allow View Channel, Send Messages, Embed Links, and Read Message History, then start it again.');
      throw error;
    }
    if (!channel || !channel.isTextBased()) throw Error('DISCORD_CHANNEL_ID is not a text channel JHWBOT can use.');
    const feed = await currentFeed();
    await publishFeed(channel, feed);
    const count = feed.fields.filter(field => field.name !== 'More rooms').length;
    console.log('[JHWBOT] Feed updated' + (feed.color === 0xd4545c ? ' (relay unavailable)' : ' (' + count + ' shown)'));
  }

  client.once('clientReady', async () => {
    console.log('[JHWBOT] Signed in as ' + client.user.tag);
    try { await registerCommands(client); console.log('[JHWBOT] /servers is registered' + (guildId ? ' for this server.' : ' globally. Global commands can take up to an hour.')); }
    catch (error) { console.error('[JHWBOT] Could not register /servers:', error.message); }
    const run = () => tick().catch(error => console.error('[JHWBOT]', error.message));
    await run();
    timer = setInterval(run, pollMs);
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'servers') return;
    await interaction.deferReply();
    const feed = await currentFeed();
    await interaction.editReply({ embeds: [embedFrom(feed)] });
  });

  process.on('SIGINT', () => { clearInterval(timer); client.destroy(); process.exit(0); });
  process.on('SIGTERM', () => { clearInterval(timer); client.destroy(); process.exit(0); });
  await client.login(token);
}

main().catch(error => {
  console.error('[JHWBOT]', error.message);
  process.exitCode = 1;
});
