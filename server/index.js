const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

app.use(express.static(path.join(__dirname, '..', 'public')));

const LETTERS = ['A','B','C','D','E','F','G','H','I','K','L','M','N','O','P','R','S','T','W','Z'];
const DEFAULT_CATEGORIES = ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'];

// rooms: Map<code, { hostId, players, categories, status, currentLetter, roundTimerId, stoppingTimerId, answers, totalScores }>
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

async function aiGroupSimilarAnswers(category, letter, answers) {
  if (!anthropic || answers.length < 2) {
    return answers.map(a => ({ answers: [a] }));
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Du bist Schiedsrichter beim Spiel "Stadt Land Fluss". Buchstabe: ${letter}, Kategorie: ${category}.

Spielerantworten: ${answers.map((a, i) => `${i + 1}. "${a}"`).join(', ')}

Gruppiere identische oder sehr ähnliche Antworten (z.B. Schreibvarianten, Übersetzungen, offensichtliche Synonyme). Antworte NUR mit JSON:
{"groups": [{"answers": ["Antwort1", "Antwort2"], "reason": "Begründung"}, {"answers": ["EinzigAntwort"]}]}`
      }],
    });

    const text = response.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Kein JSON in Antwort');
    const parsed = JSON.parse(match[0]);
    if (parsed.groups && Array.isArray(parsed.groups)) return parsed.groups;
    throw new Error('Ungültiges JSON-Format');
  } catch (e) {
    console.error('KI-Ähnlichkeitsprüfung fehlgeschlagen:', e.message);
    // Fallback: case-insensitive exact match grouping
    const groups = [];
    const assigned = new Set();
    answers.forEach(a => {
      const key = a.toLowerCase().trim();
      if (assigned.has(key)) return;
      const similar = answers.filter(b => b.toLowerCase().trim() === key);
      similar.forEach(b => assigned.add(b.toLowerCase().trim()));
      groups.push({ answers: similar, reason: similar.length > 1 ? 'Identisch' : undefined });
    });
    return groups;
  }
}

async function evaluateRound(code) {
  const room = rooms.get(code);
  if (!room) return;

  const letter = room.currentLetter;
  const playerIds = Array.from(room.players.keys());
  const cats = room.categories;

  const answersMap = {};
  playerIds.forEach(id => {
    answersMap[id] = room.answers.get(id) || {};
  });

  // Initialize: 0 for empty/wrong-letter answers, 10 for valid ones
  const scores = {};
  playerIds.forEach(id => {
    scores[id] = {};
    cats.forEach(cat => {
      const answer = (answersMap[id][cat] || '').trim();
      const valid = answer.length > 0 && answer[0].toUpperCase() === letter;
      scores[id][cat] = { points: valid ? 10 : 0, answer, reason: '' };
    });
  });

  // AI similarity check per category
  for (const cat of cats) {
    const validEntries = playerIds
      .map(id => ({ id, answer: scores[id][cat].answer }))
      .filter(x => x.answer && x.answer[0].toUpperCase() === letter);

    if (validEntries.length < 2) continue;

    const groups = await aiGroupSimilarAnswers(cat, letter, validEntries.map(x => x.answer));

    groups.forEach(group => {
      if (!group.answers || group.answers.length < 2) return;
      const groupLower = group.answers.map(a => a.toLowerCase().trim());
      validEntries.forEach(entry => {
        if (groupLower.includes(entry.answer.toLowerCase().trim())) {
          scores[entry.id][cat].points = 5;
          scores[entry.id][cat].reason = `Gleich gewertet: ${group.answers.join(' = ')}`;
        }
      });
    });
  }

  // Accumulate total scores
  playerIds.forEach(id => {
    const roundTotal = Object.values(scores[id]).reduce((s, x) => s + x.points, 0);
    room.totalScores.set(id, (room.totalScores.get(id) || 0) + roundTotal);
  });

  const results = {
    letter,
    categories: cats,
    players: playerIds.map(id => ({
      id,
      name: room.players.get(id)?.name || '?',
      roundScore: Object.values(scores[id]).reduce((s, x) => s + x.points, 0),
      totalScore: room.totalScores.get(id) || 0,
      answers: scores[id],
    })),
  };

  io.to(code).emit('roundResults', results);
}

async function endRound(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearTimeout(room.roundTimerId);
  clearTimeout(room.stoppingTimerId);
  room.status = 'ended';
  io.to(code).emit('roundEnded');

  // Wait for clients to submit their answers before evaluating
  await new Promise(resolve => setTimeout(resolve, 1500));
  await evaluateRound(code);
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
      totalScores: new Map([[socket.id, 0]]),
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
    room.totalScores.set(socket.id, 0);
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

  socket.on('newRound', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.status !== 'ended') return;

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

  socket.on('suggestCategories', async () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return;

    if (!anthropic) {
      socket.emit('categorySuggestions', { error: 'KI nicht verfügbar (API-Schlüssel fehlt).' });
      return;
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Schlage 8 lustige und kreative Kategorien für Stadt Land Fluss vor. Die Kategorien sollen überraschend und witzig sein, wie z.B. "Kündigungsgrund", "Peinliches Hobby", "Was man nicht beim Zahnarzt sagt". Antworte NUR mit einem JSON-Array von 8 Strings: ["Kategorie1", "Kategorie2", ...]`,
        }],
      });

      const text = response.content[0].text.trim();
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('no array');
      const suggestions = JSON.parse(match[0]);
      if (!Array.isArray(suggestions)) throw new Error('not array');
      socket.emit('categorySuggestions', { suggestions: suggestions.slice(0, 10).map(String) });
    } catch (e) {
      console.error('KI-Kategorienvorschläge fehlgeschlagen:', e.message);
      socket.emit('categorySuggestions', { error: 'KI-Vorschläge fehlgeschlagen. Versuche es erneut.' });
    }
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
