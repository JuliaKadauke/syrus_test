const socket = io();

let myRoomCode = null;
let amIHost = false;
let categories = [];
let roundDuration = 60;
let timerInterval = null;
let timerSecondsLeft = 0;

const views = {
  start: document.getElementById('view-start'),
  join: document.getElementById('view-join'),
  lobby: document.getElementById('view-lobby'),
  game: document.getElementById('view-game'),
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

// ── Start view ────────────────────────────────────────────────────────────────

const playerNameInput = document.getElementById('playerName');
const createRoomBtn = document.getElementById('createRoomBtn');
const showJoinBtn = document.getElementById('showJoinBtn');
const startError = document.getElementById('startError');

const joinPlayerNameInput = document.getElementById('joinPlayerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const backToStartBtn = document.getElementById('backToStartBtn');
const joinError = document.getElementById('joinError');

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

// ── Lobby ─────────────────────────────────────────────────────────────────────

const displayRoomCode = document.getElementById('displayRoomCode');
const playerList = document.getElementById('playerList');
const hostControls = document.getElementById('hostControls');
const startGameBtn = document.getElementById('startGameBtn');
const startHint = document.getElementById('startHint');
const waitingMsg = document.getElementById('waitingMsg');
const categoryControls = document.getElementById('categoryControls');
const addCategoryBtn = document.getElementById('addCategoryBtn');

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

function getCategoryValues() {
  return Array.from(document.querySelectorAll('.category-input'))
    .map(inp => inp.value.trim())
    .filter(v => v.length > 0);
}

function emitCategoryUpdate() {
  socket.emit('updateCategories', { categories: getCategoryValues() });
}

function makeCategoryItem(value) {
  const item = document.createElement('div');
  item.className = 'category-item';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'category-input';
  input.value = value;
  input.maxLength = 30;
  input.addEventListener('blur', emitCategoryUpdate);

  const delBtn = document.createElement('button');
  delBtn.className = 'category-delete-btn';
  delBtn.textContent = '×';
  delBtn.title = 'Kategorie entfernen';
  delBtn.addEventListener('click', () => {
    const allInputs = document.querySelectorAll('.category-input');
    if (allInputs.length <= 1) return; // keep at least one category
    item.remove();
    emitCategoryUpdate();
    updateAddCategoryBtn();
  });

  item.appendChild(input);
  item.appendChild(delBtn);
  return item;
}

function updateAddCategoryBtn() {
  const count = document.querySelectorAll('.category-input').length;
  addCategoryBtn.disabled = count >= 10;
}

function renderCategoryList(cats, isHost) {
  const list = document.getElementById('categoryList');
  list.innerHTML = '';

  if (isHost) {
    cats.forEach(cat => list.appendChild(makeCategoryItem(cat)));
    categoryControls.classList.remove('hidden');
    updateAddCategoryBtn();
  } else {
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    cats.forEach(cat => {
      const li = document.createElement('li');
      li.className = 'category-item-readonly';
      li.textContent = cat;
      ul.appendChild(li);
    });
    list.appendChild(ul);
    categoryControls.classList.add('hidden');
  }
}

function enterLobby({ roomCode, isHost, players, categories: cats }) {
  myRoomCode = roomCode;
  amIHost = isHost;
  categories = cats;
  displayRoomCode.textContent = roomCode;
  renderPlayers(players);
  renderCategoryList(cats, isHost);
  hostControls.classList.toggle('hidden', !isHost);
  waitingMsg.classList.toggle('hidden', isHost);
  if (isHost) updateStartButton(players);
  showView('lobby');
}

addCategoryBtn.addEventListener('click', () => {
  const allInputs = document.querySelectorAll('.category-input');
  if (allInputs.length >= 10) return;

  const list = document.getElementById('categoryList');
  const item = makeCategoryItem('');
  list.appendChild(item);
  item.querySelector('.category-input').focus();
  updateAddCategoryBtn();
});

document.getElementById('aiSuggestBtn').addEventListener('click', () => {
  // Placeholder — wird in Job 5 implementiert
});

startGameBtn.addEventListener('click', () => {
  socket.emit('startRound');
});

// ── Game view ─────────────────────────────────────────────────────────────────

const timerBar = document.getElementById('timerBar');
const timerText = document.getElementById('timerText');
const gameStatusMsg = document.getElementById('gameStatusMsg');
const stopRoundBtn = document.getElementById('stopRoundBtn');
const roundEndedSection = document.getElementById('roundEndedSection');
const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
const waitingForHostMsg = document.getElementById('waitingForHostMsg');

function updateTimerDisplay() {
  timerText.textContent = timerSecondsLeft;
  const pct = roundDuration > 0 ? (timerSecondsLeft / roundDuration) * 100 : 0;
  timerBar.style.width = pct + '%';
  timerBar.classList.toggle('timer-warn', pct < 50 && pct >= 25);
  timerBar.classList.toggle('timer-low', pct < 25);
}

function startClientTimer(duration) {
  timerSecondsLeft = duration;
  roundDuration = duration;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSecondsLeft = Math.max(0, timerSecondsLeft - 1);
    updateTimerDisplay();
    if (timerSecondsLeft === 0) stopClientTimer();
  }, 1000);
}

function stopClientTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function renderAnswerForm(letter, cats) {
  const form = document.getElementById('answerForm');
  form.innerHTML = '';
  cats.forEach(cat => {
    const group = document.createElement('div');
    group.className = 'answer-group';
    const label = document.createElement('label');
    label.textContent = cat;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'answer-input';
    input.dataset.category = cat;
    input.placeholder = `${cat} mit ${letter}…`;
    input.maxLength = 50;
    input.autocomplete = 'off';
    group.appendChild(label);
    group.appendChild(input);
    form.appendChild(group);
  });
}

function lockInputs() {
  document.querySelectorAll('.answer-input').forEach(inp => { inp.disabled = true; });
  stopRoundBtn.disabled = true;
}

function collectAndSubmitAnswers() {
  const answers = {};
  document.querySelectorAll('.answer-input').forEach(inp => {
    answers[inp.dataset.category] = inp.value.trim();
  });
  socket.emit('submitAnswers', { answers });
}

stopRoundBtn.addEventListener('click', () => {
  stopRoundBtn.disabled = true;
  socket.emit('stopRound');
});

returnToLobbyBtn.addEventListener('click', () => {
  socket.emit('returnToLobby');
});

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on('roomJoined', (data) => {
  enterLobby(data);
});

socket.on('roomUpdate', ({ players }) => {
  // Check if I became host (e.g. previous host disconnected)
  const myEntry = players.find(p => p.id === socket.id);
  if (myEntry && myEntry.isHost !== amIHost) {
    amIHost = myEntry.isHost;
    if (amIHost) {
      renderCategoryList(categories, true);
      hostControls.classList.remove('hidden');
      waitingMsg.classList.add('hidden');
    }
  }
  renderPlayers(players);
  if (amIHost) updateStartButton(players);
});

socket.on('joinError', ({ message }) => {
  joinError.textContent = message;
});

socket.on('categoriesUpdated', ({ categories: cats }) => {
  categories = cats;
  if (!amIHost) {
    renderCategoryList(cats, false);
  }
});

socket.on('roundStarted', ({ letter, categories: cats, duration }) => {
  categories = cats;

  document.getElementById('currentLetter').textContent = letter;
  renderAnswerForm(letter, cats);

  stopRoundBtn.disabled = false;
  stopRoundBtn.classList.remove('hidden');
  gameStatusMsg.classList.add('hidden');
  roundEndedSection.classList.add('hidden');

  startClientTimer(duration);
  showView('game');
});

socket.on('roundStopping', ({ countdown, stopperName }) => {
  stopClientTimer();

  timerSecondsLeft = countdown;
  roundDuration = countdown;
  updateTimerDisplay();

  stopRoundBtn.disabled = true;

  gameStatusMsg.textContent = `${stopperName} hat STOPP gerufen! Noch ${countdown} Sekunden…`;
  gameStatusMsg.classList.remove('hidden');

  timerInterval = setInterval(() => {
    timerSecondsLeft = Math.max(0, timerSecondsLeft - 1);
    updateTimerDisplay();
    gameStatusMsg.textContent = `${stopperName} hat STOPP gerufen! Noch ${timerSecondsLeft} Sekunden…`;
    if (timerSecondsLeft === 0) stopClientTimer();
  }, 1000);
});

socket.on('roundEnded', () => {
  stopClientTimer();
  lockInputs();
  collectAndSubmitAnswers();

  stopRoundBtn.classList.add('hidden');
  gameStatusMsg.classList.add('hidden');

  roundEndedSection.classList.remove('hidden');
  returnToLobbyBtn.classList.toggle('hidden', !amIHost);
  waitingForHostMsg.classList.toggle('hidden', amIHost);
});

socket.on('backToLobby', ({ players, categories: cats }) => {
  categories = cats;
  renderPlayers(players);
  renderCategoryList(cats, amIHost);
  if (amIHost) updateStartButton(players);
  showView('lobby');
});

socket.on('disconnect', () => {
  if (myRoomCode) {
    document.querySelector('.container').innerHTML =
      '<p style="color:#e94560;font-size:1.2rem;margin-top:2rem;">Verbindung getrennt. Bitte Seite neu laden.</p>';
  }
});
