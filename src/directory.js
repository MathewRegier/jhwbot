'use strict';

const PROTOCOL = 'lobby-directory-v1';

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function discordText(value, max) {
  return clean(value, max).replace(/@/g, '@\u200b').replace(/```/g, '\'\'\'');
}

function normalizeDirectory(data) {
  if (data?.protocol !== PROTOCOL || !Array.isArray(data.rooms) || data.rooms.length > 100) {
    throw Error('This relay does not have the public room list yet.');
  }
  const rooms = [];
  for (const room of data.rooms) {
    if (!room || !/^[A-F0-9]{16}$/.test(room.code)) continue;
    if (!['ghost', 'shared'].includes(room.mode)) continue;
    if (!Number.isInteger(room.players) || room.players < 1 || !Number.isInteger(room.capacity)) continue;
    if (room.capacity < 1 || room.capacity > 16 || room.players > room.capacity) continue;
    if (typeof room.joinable !== 'boolean') continue;
    rooms.push({
      code: room.code,
      name: discordText(room.name || 'Happy Wheels room', 48) || 'Happy Wheels room',
      host: discordText(room.host || 'Racer', 24) || 'Racer',
      mode: room.mode,
      players: room.players,
      capacity: room.capacity,
      passwordProtected: !!room.passwordProtected,
      level: discordText(room.level?.title || 'Choosing a level', 80) || 'Choosing a level',
      status: discordText(room.status || (room.joinable ? 'Open' : 'Unavailable'), 20) || 'Open',
      joinable: room.joinable
    });
  }
  return { protocol: PROTOCOL, rooms };
}

function listRooms(address, timeoutMs = 8000) {
  let url;
  try { url = new URL(address); } catch { throw Error('RELAY_URL is not a valid address.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password) {
    throw Error('RELAY_URL must be a ws:// or wss:// address without a password.');
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url.href);
    let settled = false;
    const timer = setTimeout(() => finish(Error('The relay did not answer.')), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      if (error) reject(error); else resolve(value);
    }
    ws.addEventListener('open', () => {
      try { ws.send(JSON.stringify({ type: 'browse' })); } catch { finish(Error('Could not ask the relay for rooms.')); }
    });
    ws.addEventListener('message', event => {
      try {
        const text = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
        if (text.length > 128 * 1024) throw Error('The room list was too large.');
        const data = JSON.parse(text);
        if (data.type === 'error') return finish(Error(clean(data.message, 180) || 'The relay refused the room list.'));
        if (data.type !== 'directory') return;
        finish(null, normalizeDirectory(data));
      } catch (error) {
        finish(error instanceof Error && error.message.startsWith('This relay') ? error : Error('The relay sent an invalid room list.'));
      }
    });
    ws.addEventListener('error', () => finish(Error('Could not reach the multiplayer relay.')));
    ws.addEventListener('close', () => finish(Error('The relay closed before sending the room list.')));
  });
}

function modeLabel(mode) {
  return mode === 'shared' ? 'Shared Physics' : 'Ghost Multiplayer';
}

function renderFeed({ rooms = [], error = '' } = {}) {
  const players = rooms.reduce((sum, room) => sum + room.players, 0);
  const title = error ? 'JHWBOT · Room feed unavailable' : rooms.length ? `JHWBOT · ${rooms.length} public room${rooms.length === 1 ? '' : 's'} · ${players} playing` : 'JHWBOT · No public rooms';
  const lines = error
    ? [error, '', 'The last good list is replaced until the relay answers again.']
    : rooms.length
      ? ['Open Multiplayer and join from the public room list. Friends-only rooms stay hidden.']
      : ['Nobody has a public room open.', 'Host one in Multiplayer and set it to Public so it shows up here.'];
  const shown = rooms.slice(0, 12);
  const fields = shown.map(room => ({
    name: `${room.joinable ? '🟢' : '🔴'} ${room.name}`.slice(0, 256),
    value: [
      `${modeLabel(room.mode)} · ${room.status}`,
      `Hosted by ${room.host} · ${room.level}`,
      `${room.players}/${room.capacity} players · ${room.passwordProtected ? 'Password required' : 'No password'}`
    ].join('\n').slice(0, 1024)
  }));
  if (rooms.length > shown.length) {
    fields.push({ name: 'More rooms', value: `${rooms.length - shown.length} more public rooms are open in the game browser.` });
  }
  return {
    title: title.slice(0, 256),
    description: lines.join('\n').slice(0, 4096),
    color: error ? 0xd4545c : rooms.length ? 0xf2cb64 : 0x536b75,
    fields,
    footer: { text: 'JHWBOT · public rooms only' }
  };
}

module.exports = { PROTOCOL, listRooms, normalizeDirectory, renderFeed, modeLabel };
