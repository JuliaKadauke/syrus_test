const socket = io();

const playerNameInput = document.getElementById('playerName');
const joinBtn = document.getElementById('joinBtn');
const statusMsg = document.getElementById('statusMsg');

joinBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    statusMsg.textContent = 'Bitte gib einen Spielernamen ein.';
    return;
  }
  socket.emit('join', name);
});

playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

socket.on('welcome', ({ message }) => {
  statusMsg.textContent = message;
});

socket.on('connect', () => {
  console.log('Mit Server verbunden');
});

socket.on('disconnect', () => {
  statusMsg.textContent = 'Verbindung getrennt. Bitte Seite neu laden.';
});
