'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { normalizeDirectory, renderFeed, listRooms } = require('../src/directory');

function room(overrides = {}) {
  return { code: 'ABCDEF0123456789', name: 'Sword night', host: 'Jimbob', mode: 'ghost', players: 2, capacity: 8, passwordProtected: false, joinable: true, status: 'Open', level: { title: 'Balcony' }, ...overrides };
}

test('public room list keeps only complete rooms', () => {
  const result = normalizeDirectory({ protocol: 'lobby-directory-v1', rooms: [room(), room({ code: 'nope' }), room({ mode: 'shared', players: 8, capacity: 8, joinable: false, status: 'Full' })] });
  assert.equal(result.rooms.length, 2);
  assert.equal(result.rooms[1].mode, 'shared');
  assert.equal(result.rooms[1].status, 'Full');
});

test('room names cannot ping the Discord', () => {
  const result = normalizeDirectory({ protocol: 'lobby-directory-v1', rooms: [room({ name: '@everyone crash', host: '@here' })] });
  assert.equal(result.rooms[0].name.includes('@everyone'), false);
  assert.equal(result.rooms[0].host.includes('@here'), false);
});

test('empty and error feeds say what players should do', () => {
  const empty = renderFeed({ rooms: [] });
  assert.match(empty.title, /No public rooms/);
  assert.match(empty.description, /set it to Public/);
  const failed = renderFeed({ error: 'Could not reach the multiplayer relay.' });
  assert.match(failed.title, /unavailable/);
  assert.equal(failed.fields.length, 0);
});

test('a room feed includes the mode and password state without the join code', () => {
  const feed = renderFeed({ rooms: normalizeDirectory({ protocol: 'lobby-directory-v1', rooms: [room({ passwordProtected: true, mode: 'shared' })] }).rooms });
  assert.equal(feed.fields.length, 1);
  assert.match(feed.fields[0].value, /Shared Physics/);
  assert.match(feed.fields[0].value, /Password required/);
  assert.doesNotMatch(feed.fields[0].value, /ABCDEF0123456789/);
  assert.doesNotMatch(feed.fields[0].value, /Code/);
});

test('listRooms reads one browse reply and closes', async () => {
  const http = createServer();
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server: http });
  wss.on('connection', socket => {
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.type === 'browse') socket.send(JSON.stringify({ type: 'directory', protocol: 'lobby-directory-v1', rooms: [room()] }));
    });
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  try {
    const result = await listRooms('ws://127.0.0.1:' + http.address().port);
    assert.equal(result.rooms[0].name, 'Sword night');
  } finally {
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => http.close(resolve));
  }
});
