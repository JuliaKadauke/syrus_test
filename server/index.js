const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

io.on('connection', (socket) => {
  console.log('Spieler verbunden:', socket.id);

  socket.on('join', (playerName) => {
    console.log(`${playerName} ist beigetreten`);
    socket.emit('welcome', { message: `Willkommen, ${playerName}!` });
  });

  socket.on('disconnect', () => {
    console.log('Spieler getrennt:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Stadt Land Kündigungsgrund läuft auf Port ${PORT}`);
});

module.exports = { app, server };
