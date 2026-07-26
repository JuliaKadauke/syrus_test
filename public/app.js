const socket = io();

let myRoomCode = null;
let amIHost = false;

const views = {
  start: document.getElementById('view-start'),
  join: document.getElementById('view-join'),
  lobby: document.getElementById('view-lobby'),
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

const playerNameInput = document.getElementById('playerName');
const createRoomBtn = document.getElementById('createRoomBtn');
const showJoinBtn = document.getElementById('showJoinBtn');
const startError = document.getElementById('startError');

const joinPlayerNameInput = document.getElementById('joinPlayerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const backToStartBtn = document.getElementById('backToStartBtn');
const joinError = document.getElementById('joinError');

const displayRoomCode = document.getElementById('displayRoomCode');
const playerList = document.getElementById('playerList');
const hostControls = document.getElementById('hostControls');
const startGameBtn = document.getElementById('startGameBtn');
const startHint = document.getElementById('startHint');
const waitingMsg = document.getElementById('waitingMsg');

function renderPlayers(players) {
  playerList.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-item' + (p.isHost ? ' is-host' : '');
    li.textContent = p.name + (p.isHost ? ' \u{1F451}' : '');
    playerList.appendChild(li);
  });
}

function updateStartButton(players) {
  const canStart = players.length >= 2;
  startGameBtn.disabled = !canStart;
  startHint.classList.toggle('hidden', canStart);
}

function enterLobby({ roomCode, isHost, players }) {
  myRoomCode = roomCode;
  amIHost = isHost;
  displayRoomCode.textContent = roomCode;
  renderPlayers(players);
  hostControls.classList.toggle('hidden', !isHost);
  waitingMsg.classList.toggle('hidden', isHost);
  if (isHost) updateStartButton(players);
  showView('lobby');
}

createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) { startError.textContent = 'Bitte gib einen Namen ein.'; return; }
  startError.textContent = '';
  socket.emit('createRoom', { playerName: name });
});

showJoinBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (name) joinPlayerNameInput.value = name;
  startError.textContent = '';
  showView('join');
});

playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createRoomBtn.click();
});

joinRoomBtn.addEventListener('click', () => {
  const name = joinPlayerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) { joinError.textContent = 'Bitte gib einen Namen ein.'; return; }
  if (!code) { joinError.textContent = 'Bitte gib einen Raum-Code ein.'; return; }
  joinError.textContent = '';
  socket.emit('joinRoom', { playerName: name, roomCode: code });
});

backToStartBtn.addEventListener('click', () => {
  joinError.textContent = '';
  showView('start');
});

roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoomBtn.click();
});

socket.on('roomJoined', (data) => {
  enterLobby(data);
});

socket.on('roomUpdate', ({ players }) => {
  renderPlayers(players);
  if (amIHost) updateStartButton(players);
});

socket.on('joinError', ({ message }) => {
  joinError.textContent = message;
});

socket.on('disconnect', () => {
  if (myRoomCode) {
    document.querySelector('.container').innerHTML =
      '<p style="color:#e94560;font-size:1.2rem;margin-top:2rem;">Verbindung getrennt. Bitte Seite neu laden.</p>';
  }
});
