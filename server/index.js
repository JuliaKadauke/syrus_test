const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

const LETTERS = ['A','B','C','D','E','F','G','H','I','K','L','M','N','O','P','R','S','T','W','Z'];
const DEFAULT_CATEGORIES = ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'];

// rooms: Map<code, { hostId, players, categories, status, currentLetter, roundTimerId, stoppingTimerId, answers }>
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0 or I/1 confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRoomPlayerList(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({
    id,
    name: p.name,
    isHost: id === room.hostId,
  }));
}

function endRound(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearTimeout(room.roundTimerId);
  clearTimeout(room.stoppingTimerId);
  room.status = 'ended';
  io.to(code).emit('roundEnded');
}

io.on('connection', (socket) => {
  console.log('Spieler verbunden:', socket.id);

  socket.on('createRoom', ({ playerName }) => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    const room = {
      hostId: socket.id,
      players: new Map([[socket.id, { name: playerName }]]),
      categories: [...DEFAULT_CATEGORIES],
      status: 'lobby',
      currentLetter: null,
      roundTimerId: null,
      stoppingTimerId: null,
      answers: new Map(),
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit('roomJoined', {
      roomCode: code,
      isHost: true,
      players: getRoomPlayerList(room),
      categories: room.categories,
    });

    console.log(`Raum ${code} erstellt von ${playerName}`);
  });

  socket.on('joinRoom', ({ playerName, roomCode }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('joinError', { message: 'Raum nicht gefunden. Überprüfe den Code.' });
      return;
    }

    if (room.status !== 'lobby') {
      socket.emit('joinError', { message: 'Das Spiel läuft bereits. Warte auf die nächste Runde.' });
      return;
    }

    room.players.set(socket.id, { name: playerName });
    socket.join(code);
    socket.data.roomCode = code;

    const players = getRoomPlayerList(room);

    socket.emit('roomJoined', {
      roomCode: code,
      isHost: false,
      players,
      categories: room.categories,
    });

    socket.to(code).emit('roomUpdate', { players });

    console.log(`${playerName} ist Raum ${code} beigetreten`);
  });

  socket.on('updateCategories', ({ categories }) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return;

    const cats = categories
      .map(c => String(c).trim())
      .filter(c => c.length > 0)
      .slice(0, 10);
    if (cats.length === 0) return;

    room.categories = cats;
    // Broadcast to non-host players only; host manages their own DOM
    socket.to(code).emit('categoriesUpdated', { categories: cats });
  });

  socket.on('startRound', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return;

    const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const duration = Math.max(60, Math.min(120, room.categories.length * 12));

    room.status = 'playing';
    room.currentLetter = letter;
    room.answers = new Map();

    io.to(code).emit('roundStarted', {
      letter,
      categories: room.categories,
      duration,
    });

    room.roundTimerId = setTimeout(() => endRound(code), duration * 1000);
  });

  socket.on('stopRound', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;

    const stopperName = room.players.get(socket.id)?.name || 'Jemand';
    clearTimeout(room.roundTimerId);
    room.status = 'stopping';

    io.to(code).emit('roundStopping', { countdown: 10, stopperName });

    room.stoppingTimerId = setTimeout(() => endRound(code), 10000);
  });

  socket.on('submitAnswers', ({ answers }) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    room.answers.set(socket.id, answers);
    console.log(`Antworten von ${socket.id} in Raum ${code} gespeichert`);
  });

  socket.on('returnToLobby', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.status !== 'ended') return;

    room.status = 'lobby';
    room.currentLetter = null;
    room.answers = new Map();

    const players = getRoomPlayerList(room);
    io.to(code).emit('backToLobby', { players, categories: room.categories });
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    room.players.delete(socket.id);

    if (room.players.size === 0) {
      clearTimeout(room.roundTimerId);
      clearTimeout(room.stoppingTimerId);
      rooms.delete(code);
      console.log(`Raum ${code} gelöscht (leer)`);
      return;
    }

    const wasHost = room.hostId === socket.id;
    if (wasHost) {
      room.hostId = room.players.keys().next().value;
      if (room.status === 'playing' || room.status === 'stopping') {
        endRound(code);
      }
    }

    const players = getRoomPlayerList(room);
    io.to(code).emit('roomUpdate', { players });

    console.log(`Spieler aus Raum ${code} getrennt`);
  });
});

server.listen(PORT, () => {
  console.log(`Stadt Land Kündigungsgrund läuft auf Port ${PORT}`);
});

module.exports = { app, server };
