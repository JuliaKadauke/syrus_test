const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

// rooms: Map<code, { hostId: string, players: Map<socketId, { name: string }> }>
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
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit('roomJoined', {
      roomCode: code,
      isHost: true,
      players: getRoomPlayerList(room),
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

    room.players.set(socket.id, { name: playerName });
    socket.join(code);
    socket.data.roomCode = code;

    const players = getRoomPlayerList(room);

    socket.emit('roomJoined', {
      roomCode: code,
      isHost: false,
      players,
    });

    socket.to(code).emit('roomUpdate', { players });

    console.log(`${playerName} ist Raum ${code} beigetreten`);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    room.players.delete(socket.id);

    if (room.players.size === 0) {
      rooms.delete(code);
      console.log(`Raum ${code} gelöscht (leer)`);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players.keys().next().value;
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
