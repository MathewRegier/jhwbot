# JHWBOT

Discord bot for Jimbob's Happy Wheels server. The first feature is a live feed of public multiplayer rooms.

Friends-only rooms are not shown. The feed uses the same public room list as the in-game browser.

## Setup

1. Open https://discord.com/developers/applications and create an application named **JHWBOT**.
2. Open **Bot**, click **Reset Token**, and copy the token. Leave the privileged intent switches off.
3. Open **OAuth2 → URL Generator**. Select `bot` and `applications.commands`. Select these permissions: View Channels, Send Messages, Embed Links, Read Message History.
4. Open the generated URL and add JHWBOT to your server.
5. In Discord, open **User Settings → Advanced** and turn on **Developer Mode**.
6. Right-click the server name and choose **Copy Server ID**. Right-click the channel for the feed and choose **Copy Channel ID**.
7. In this folder, copy `.env.example` to `.env` and fill in the token, server ID, and channel ID.
8. Install and start it:

```powershell
npm install
npm start
```

Leave that window open. JHWBOT posts one message in the channel and edits it every 20 seconds. `/servers` answers with the same list wherever you use it. Join codes are not shown.

If the feed message is deleted, the next refresh posts a new one. Pin that message if you want it kept at the top of the channel.

## Railway

1. Create a new Railway project from the GitHub repo `MathewRegier/jhwbot`.
2. Add these variables. Do not commit them:

```env
DISCORD_TOKEN=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=
RELAY_URL=wss://web-production-79ef3.up.railway.app
POLL_SECONDS=20
```

3. Deploy. The start command is `npm start`. There is no web health check, because this process only talks to Discord and the relay.
4. Optional: add a volume mounted at `/app/data` so a redeploy keeps editing the same feed message. Without it, the next start posts a new message and leaves the old one in the channel.
