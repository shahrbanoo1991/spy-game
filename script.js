/* ==========================================================================
   SPY GAME — FRONTEND LOGIC
   Vanilla JS. Screens are toggled by adding/removing the `.is-active` class
   on <section class="screen"> elements.

   ------------------------------------------------------------------------
   BACKEND ENDPOINTS (FastAPI) — wire these in where marked "FASTAPI:"
     GET /join/{player_name}   -> join a room as this player
     GET /players              -> list current players in the room
     GET /start                -> host starts the game
     GET /role/{player_name}   -> get this player's role for the round
   ------------------------------------------------------------------------
   Everything in MOCK DATA / MOCK BEHAVIOUR sections below exists only so
   the UI is fully clickable today. Delete the mock bits once your real
   API calls are wired in — they're isolated on purpose.
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIG — point this at your FastAPI server
  ------------------------------------------------------------------ */
  const API_BASE_URL = 'http://localhost:8000'; // TODO: set your backend origin

  /* ------------------------------------------------------------------
     APP STATE
     Replace/extend this as your backend contracts firm up. Keeping all
     mutable state in one place makes it easy to swap mock data for
     real API responses later.
  ------------------------------------------------------------------ */
  const state = {
    playerName: null,
    isHost: false,
    roomCode: null,
    players: [],          // [{ name, isHost, isReady }]
    myRole: null,         // 'spy' | 'normal'
    secretWord: null,
  
    round: 1,
    timerSeconds: 180,
    timerTotal: 180,
    timerHandle: null,
    selectedVoteName: null,
    lobbyInterval: null,
    gameInterval: null,
    resultInterval: null,
    roundInterval: null,
    revotePlayers: [],
    voteVersion: 1,
  };

  /* ------------------------------------------------------------------
     DOM SHORTCUTS
  ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const screens = $all('.screen');
  const screenEls = {};
  screens.forEach(s => { screenEls[s.dataset.screen] = s; });

  /* ------------------------------------------------------------------
     SCREEN NAVIGATION
  ------------------------------------------------------------------ */
  function goToScreen(name) {
    screens.forEach(s => s.classList.remove('is-active'));
    const target = screenEls[name];
    if (target) target.classList.add('is-active');
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------
     HELPERS
  ------------------------------------------------------------------ */
  function initials(name) {
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase();
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function randomRoomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  /* ==================================================================
     SCREEN 1 — HOME / JOIN
  ================================================================== */
  const nameInput = $('#input-name');
  const btnJoin = $('#btn-join');
  const btnCreate = $('#btn-create');
  const roomCodeEntry = $('#room-code-entry');
  const roomCodeInput = $('#input-room-code');
  const btnConfirmJoin = $('#btn-confirm-join');

  btnJoin.addEventListener('click', () => {
    if (!validateName()) return;
    // Reveal the room-code field instead of navigating immediately —
    // the player still needs to tell us which room to join.
    roomCodeEntry.classList.add('is-open');
    roomCodeInput.focus();
  });

    btnCreate.addEventListener('click', async () => {
        if (!validateName()) return;

        state.playerName = nameInput.value.trim();
        state.isHost = true;

        const response = await fetch('/create');
        const data = await response.json();

        state.roomCode = data.room_code;
        await fetch(
            `/set-host/${state.roomCode}/${encodeURIComponent(state.playerName)}`
        );
        const joinResponse = await fetch(
            `/join/${state.roomCode}/${encodeURIComponent(state.playerName)}`
        );
        const playersResponse = await fetch(`/players/${state.roomCode}`);
        const playersData = await playersResponse.json();
        state.isHost = playersData.host === state.playerName;

        state.players = playersData.players.map(name => ({
            name: name,
            isHost: name === playersData.host,
            isReady: true
        }));
        enterLobby();
    });
    // FASTAPI: create a new room on your backend (endpoint not listed yet —
    // add e.g. GET /create, then join the creator via /join/{player_name}).
    // const createRes = await fetch(`${API_BASE_URL}/create`);
    // const { room_code } = await createRes.json();
    // await fetch(`${API_BASE_URL}/join/${encodeURIComponent(state.playerName)}`);

    // ---- MOCK BEHAVIOUR: fabricate a room code and seed one player ----
    

  btnConfirmJoin.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim();
    if (code.length !== 4) {
      roomCodeInput.focus();
      return;
    }
    state.playerName = nameInput.value.trim();
    state.isHost = false;
      state.roomCode = code;
      const joinResponse = await fetch(
          `/join/${state.roomCode}/${encodeURIComponent(state.playerName)}`
      );

      const joinData = await joinResponse.json();

      if (joinData.message) {
          alert(joinData.message);
          return;
      }
      const playersResponse = await fetch(`/players/${state.roomCode}`);
      const playersData = await playersResponse.json();
    // FASTAPI: join an existing room
    // await fetch(`${API_BASE_URL}/join/${encodeURIComponent(state.playerName)}`);
    // const players = await (await fetch(`${API_BASE_URL}/players`)).json();

    // ---- MOCK BEHAVIOUR: seed a small lobby so the screen isn't empty ----
      state.isHost = playersData.host === state.playerName;

      state.players = playersData.players.map(name => ({
          name: name,
          isHost: name === playersData.host,
          isReady: true
      }));
    // ----------------------------------------------------------------

      enterLobby();

   
  });

  function validateName() {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.style.borderColor = 'var(--c-red-bright)';
      setTimeout(() => { nameInput.style.borderColor = ''; }, 900);
      return false;
    }
    return true;
  }

  /* ==================================================================
     SCREEN 2 — LOBBY
  ================================================================== */
  const roomCodeValue = $('#room-code-value');
  const btnCopyCode = $('#btn-copy-code');
  const playerList = $('#player-list');
  const playersCountValue = $('#players-count-value');
  const waitingRow = $('#waiting-row');
  const btnStartGame = $('#btn-start-game');
  const timerSettings = $('#timer-settings');
  const timerOptions = $all('.timer-option');
  const lobbyHint = $('#lobby-hint');
  const tplPlayerRow = $('#tpl-player-row');
  const MIN_PLAYERS = 3;

    async function refreshPlayersFromServer() {
        const response = await fetch(`/players/${state.roomCode}`);
        const data = await response.json();

        state.isHost = data.host === state.playerName;

        state.players = data.players.map(name => ({
            name: name,
            isHost: name === data.host,
            isReady: true
        }));

        renderPlayerList();
        const statusResponse = await fetch(`/status/${state.roomCode}`);
        const statusData = await statusResponse.json();
        state.timerTotal = statusData.timer_seconds;
        state.timerSeconds = statusData.timer_seconds;
        timerOptions.forEach(option => {
            option.classList.toggle(
                'is-selected',
                Number(option.dataset.seconds) === statusData.timer_seconds
            );
        });
        if (statusData.started === true) {
            clearInterval(state.lobbyInterval);
            enterRoleReveal();
        }
    }
  function enterLobby() {
    roomCodeValue.textContent = state.roomCode;
    renderPlayerList();
    goToScreen('lobby');
    clearInterval(state.lobbyInterval);
    state.lobbyInterval = setInterval(refreshPlayersFromServer, 2000);

    // FASTAPI: replace with polling or a websocket subscription, e.g.
    // setInterval(refreshPlayersFromServer, 2000);
  }

  function renderPlayerList() {
    playerList.innerHTML = '';
    state.players.forEach(p => {
      const node = tplPlayerRow.content.firstElementChild.cloneNode(true);
      node.classList.toggle('is-host', p.isHost);
      node.classList.toggle('is-ready', p.isReady);
      $('.player-avatar', node).textContent = initials(p.name);
      $('.player-name', node).textContent = p.name;
      playerList.appendChild(node);
    });

    playersCountValue.textContent = state.players.length;
    waitingRow.style.display = state.players.length < MIN_PLAYERS ? 'flex' : 'none';
     
    const canStart = state.isHost && state.players.length >= MIN_PLAYERS;
    btnStartGame.style.display = state.isHost ? 'flex' : 'none';
    timerSettings.style.display = state.isHost ? 'block' : 'none';
    btnStartGame.disabled = !canStart;
    lobbyHint.textContent = state.isHost
      ? (canStart ? 'You may start the mission when ready' : `Waiting for ${MIN_PLAYERS - state.players.length} more agent(s)`)
      : 'Only the host can start · 3 agents minimum';
  }
    timerOptions.forEach(button => {
        button.addEventListener('click', async () => {

            if (!state.isHost) {
                return;
            }

            const seconds = button.dataset.seconds;

            const response = await fetch(
                `/set-timer/${state.roomCode}/${seconds}`
            );

            const data = await response.json();

            if (data.message !== "Timer updated") {
                alert(data.message);
                return;
            }

            timerOptions.forEach(option => {
                option.classList.remove('is-selected');
            });

            button.classList.add('is-selected');
        });
    });

  btnCopyCode.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      const label = $('span:last-child', btnCopyCode);
      const original = label.textContent;
      label.textContent = 'COPIED';
      setTimeout(() => { label.textContent = original; }, 1400);
    } catch (err) {
      console.warn('Clipboard copy failed', err);
    }
  });

  $('#btn-lobby-leave').addEventListener('click', () => {
    goToScreen('home');
  });

    btnStartGame.addEventListener('click', async () => {

        const response = await fetch(`/start/${state.roomCode}`);
        const data = await response.json();
        if (data.message !== "Game started") {
            alert(data.message);
            return;
        }
        clearInterval(state.lobbyInterval);
        enterRoleReveal();

    });

  /* ==================================================================
     SCREEN 3 — ROLE REVEAL
  ================================================================== */
  const rolePending = $('#role-pending');
  const btnRevealRole = $('#btn-reveal-role');
  const roleResultNormal = $('#role-result-normal');
  const roleResultSpy = $('#role-result-spy');
  const secretWordValue = $('#secret-word-value');
  const btnRoleContinueNormal = $('#btn-role-continue-normal');
  const btnRoleContinueSpy = $('#btn-role-continue-spy');

  function enterRoleReveal() {
    rolePending.hidden = false;
    roleResultNormal.hidden = true;
    roleResultSpy.hidden = true;
    goToScreen('role');
  }

    btnRevealRole.addEventListener('click', async () => {

        const response = await fetch(
            `/role/${state.roomCode}/${encodeURIComponent(state.playerName)}`
        );

        const data = await response.json();

        let role;
        let word = null;

        if (data.role === "You are the spy") {
            role = "spy";
        } else {
            role = "normal";
            word = data.word;
        }

        state.myRole = role;
        state.secretWord = word;

        rolePending.hidden = true;

        if (role === 'spy') {
            roleResultSpy.hidden = false;
        } else {
            secretWordValue.textContent = word;
            roleResultNormal.hidden = false;
        }
    });

  btnRoleContinueNormal.addEventListener('click', enterGameScreen);
  btnRoleContinueSpy.addEventListener('click', enterGameScreen);

  /* ==================================================================
     SCREEN 4 — GAME / DISCUSSION
  ================================================================== */
  const roundIndicator = $('#round-indicator');
  const playersInGameCount = $('#players-in-game-count');

  const inGamePlayers = $('#in-game-players');
  const tplPlayerChip = $('#tpl-player-chip');
  const timerValue = $('#timer-value');
  const timerRingProgress = $('#timer-ring-progress');
  const btnGoToVote = $('#btn-go-to-vote');

  const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // matches r=90 in the SVG
    async function checkGameStatus() {
        const response = await fetch(`/status/${state.roomCode}`);
        const data = await response.json();

        if (data.voting_started === true) {
            clearInterval(state.gameInterval);
            clearInterval(state.timerHandle);
            enterVotingScreen();
        }
    }
  function enterGameScreen() {
    roundIndicator.textContent = `ROUND ${state.round}`;
    playersInGameCount.textContent = state.players.length || 6;

    // FASTAPI: GET /players — determine whose turn it is / render live roster.
    // Replace this mock roster with the real response.
    const roster = state.players.length ? state.players : [
      { name: 'Agent Vega' }, { name: 'Agent Nyx' }, { name: 'Agent Cobalt' },
      { name: 'Agent Reyes' }, { name: 'Agent Kade' }, { name: state.playerName || 'You' },
    ];


    inGamePlayers.innerHTML = '';
    roster.forEach(p => {
      const chip = tplPlayerChip.content.firstElementChild.cloneNode(true);
      $('.player-chip-avatar', chip).textContent = initials(p.name);
      $('.player-chip-name', chip).textContent = p.name;
      inGamePlayers.appendChild(chip);
    });

    startTimer(state.timerTotal);
    goToScreen('game');
    clearInterval(state.gameInterval);
    state.gameInterval = setInterval(checkGameStatus, 1000);
  }

  function startTimer(seconds) {
    clearInterval(state.timerHandle);
    state.timerSeconds = seconds;
    updateTimerDisplay();

    state.timerHandle = setInterval(() => {
      state.timerSeconds -= 1;
      updateTimerDisplay();
      if (state.timerSeconds <= 0) {
        clearInterval(state.timerHandle);
        enterVotingScreen();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    timerValue.textContent = formatTime(Math.max(state.timerSeconds, 0));
    const ratio = Math.max(state.timerSeconds, 0) / state.timerTotal;
    timerRingProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - ratio));
  }

    btnGoToVote.addEventListener('click', async () => {
        const response = await fetch(`/start-voting/${state.roomCode}`);
        const data = await response.json();

        if (data.message !== "Voting started") {
            alert(data.message);
            return;
        }
        state.voteVersion = data.vote_version || 1;
        state.revotePlayers = [];
        clearInterval(state.timerHandle);
        enterVotingScreen();
    });

  /* ==================================================================
     SCREEN 5 — VOTING
  ================================================================== */
  const voteGrid = $('#vote-grid');
  const tplVoteCard = $('#tpl-vote-card');
  const btnConfirmVote = $('#btn-confirm-vote');

function enterVotingScreen() {
    state.selectedVoteName = null;
    btnConfirmVote.disabled = true;

    const voteButtonLabel = btnConfirmVote.querySelector('span:first-child');

    if (voteButtonLabel) {
        voteButtonLabel.textContent = 'CONFIRM VOTE';
    }
    const roster = state.players.filter(player =>
        player.name !== state.playerName
    );

    voteGrid.innerHTML = '';
    roster.forEach(p => {
      const card = tplVoteCard.content.firstElementChild.cloneNode(true);
      $('.vote-card-avatar', card).textContent = initials(p.name);
      $('.vote-card-name', card).textContent = p.name;
      card.addEventListener('click', () => selectVoteCard(card, p.name));
      voteGrid.appendChild(card);
    });

    goToScreen('vote');
  }

  function selectVoteCard(card, playerName) {
    $all('.vote-card', voteGrid).forEach(c => c.classList.remove('is-selected'));
    card.classList.add('is-selected');
    state.selectedVoteName = playerName;
    btnConfirmVote.disabled = false;
  }
    async function checkVotingResult() {

        const response = await fetch(
            `/result/${state.roomCode}/${state.voteVersion}`
        );

        const data = await response.json();

        if (data.ready !== true) {
            return;
        }

        clearInterval(state.resultInterval);

        state.spyName = data.spy;
        state.secretWord = data.secret_word;
        state.winner = data.winner;

        if (data.tie === false) {
            state.accusedPlayer = data.accused_player;
        }

        enterResultsScreen();
    }

    


    // ==========================================
    // CONFIRM VOTE
    // ==========================================
    btnConfirmVote.addEventListener('click', async () => {

        if (!state.selectedVoteName) {
            alert('Please select a player first.');
            return;
        }

        const response = await fetch(
            `/vote/${state.roomCode}/${state.voteVersion}/${encodeURIComponent(state.playerName)}/${encodeURIComponent(state.selectedVoteName)}`
        );

        const data = await response.json();

        if (data.message !== "Vote recorded") {
            alert(data.message);
            return;
        }

        btnConfirmVote.disabled = true;
        btnConfirmVote.textContent = 'VOTE SUBMITTED';

        clearInterval(state.resultInterval);

        state.resultInterval = setInterval(
            checkVotingResult,
            1000
        );
    });
  /* ==================================================================
     SCREEN 6 — RESULTS
  ================================================================== */
  const resultsOutcomeTag = $('#results-outcome-tag');
  const revealAvatar = $('#reveal-avatar');
  const revealName = $('#reveal-name');
  const revealWord = $('#reveal-word');
  const scoreList = $('#score-list');
  const tplScoreRow = $('#tpl-score-row');
  const btnPlayAgain = $('#btn-play-again');
  const btnBackHome = $('#btn-back-home');

    async function checkForNewRound() {
        const response = await fetch(`/status/${state.roomCode}`);
        const data = await response.json();

        if (data.round > state.round) {
            clearInterval(state.roundInterval);

            state.round = data.round;
            state.myRole = null;
            state.selectedVoteName = null;
            state.revotePlayers = [];

            enterRoleReveal();
        }
    }
function enterResultsScreen() {

    const spyName = state.spyName;
    const agentsWon = state.winner === 'agents';

    resultsOutcomeTag.textContent = agentsWon ? 'AGENTS WIN' : 'SPY WINS';

    resultsOutcomeTag.classList.toggle(
        'role-tag--normal',
        agentsWon
    );

    resultsOutcomeTag.classList.toggle(
        'role-tag--spy',
        !agentsWon
    );

    revealAvatar.textContent = initials(spyName);
    revealName.textContent = spyName;
    revealWord.textContent = state.secretWord;

    scoreList.innerHTML = '';
    btnPlayAgain.style.display = state.isHost ? 'flex' : 'none';
    goToScreen('results');
    clearInterval(state.roundInterval);
    state.roundInterval = setInterval(checkForNewRound, 1000);
}

btnPlayAgain.addEventListener('click', async () => {

    if (!state.isHost) {
        return;
    }

    const response = await fetch(`/play-again/${state.roomCode}`);
    const data = await response.json();

    if (data.message !== "New round started") {
        alert(data.message);
        return;
    }

    enterRoleReveal();
});

  btnBackHome.addEventListener('click', () => {
    // Reset local state for a fresh session.
    clearInterval(state.timerHandle);
    clearInterval(state.lobbyInterval);
    clearInterval(state.gameInterval);
    clearInterval(state.resultInterval);
    clearInterval(state.roundInterval);    
    state.playerName = null;
    state.isHost = false;
    state.roomCode = null;
    state.players = [];
    state.myRole = null;
    state.round = 1;
    roomCodeEntry.classList.remove('is-open');
    nameInput.value = '';
    roomCodeInput.value = '';
    goToScreen('home');
  });

  /* ------------------------------------------------------------------
     INIT
  ------------------------------------------------------------------ */
  goToScreen('home');
})();
