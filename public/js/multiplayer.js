// TypeSprint Multiplayer Arena WebSockets Controller

const Multiplayer = {
    socket: null,
    currentRoomCode: null,
    textTarget: "",
    currentIndex: 0,
    startTime: null,
    isRaceActive: false,
    isFinished: false,
    myWpm: 0,

    init: () => {
        Multiplayer.bindEvents();
    },

    bindEvents: () => {
        // Matchmaking
        document.getElementById('btn-multi-matchmaking').addEventListener('click', Multiplayer.startMatchmaking);
        document.getElementById('btn-cancel-matchmaking').addEventListener('click', Multiplayer.cancelMatchmaking);
        
        // Rooms
        document.getElementById('btn-multi-create').addEventListener('click', () => {
            Multiplayer.ensureSocket();
            Multiplayer.socket.emit('create_room');
        });

        document.getElementById('btn-multi-join').addEventListener('click', () => {
            const codeInput = document.getElementById('input-room-code');
            const code = codeInput.value.trim().toUpperCase();
            if (!code) return App.showToast('Please enter a room code.', 'error');
            
            Multiplayer.ensureSocket();
            Multiplayer.socket.emit('join_room', code);
            codeInput.value = '';
        });

        document.getElementById('btn-toggle-ready').addEventListener('click', () => {
            if (Multiplayer.socket) {
                Multiplayer.socket.emit('toggle_ready');
            }
        });

        // Chat
        document.getElementById('btn-send-room-chat').addEventListener('click', Multiplayer.sendChatMessage);
        document.getElementById('input-room-chat').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') Multiplayer.sendChatMessage();
        });

        // Hidden typist bind
        const hiddenTyper = document.getElementById('multi-hidden-typer');
        hiddenTyper.addEventListener('input', Multiplayer.handleTypingInput);
        hiddenTyper.addEventListener('keydown', Multiplayer.handleSpecialKeys);

        document.getElementById('multi-typing-arena-wrapper').addEventListener('click', () => {
            hiddenTyper.focus();
        });
    },

    ensureSocket: () => {
        if (!Multiplayer.socket) {
            Multiplayer.socket = API.getSocket();
            Multiplayer.bindSocketEvents();
        }
    },

    bindSocketEvents: () => {
        // Handlers
        Multiplayer.socket.on('room_joined', Multiplayer.onRoomJoined);
        Multiplayer.socket.on('room_players_updated', Multiplayer.onPlayersUpdated);
        
        Multiplayer.socket.on('join_room_error', (data) => {
            App.showToast(data.error, 'error');
            Multiplayer.resetLobbyUI();
        });

        Multiplayer.socket.on('matchmaking_queued', (data) => {
            document.getElementById('matchmaking-status-text').textContent = data.message;
        });

        Multiplayer.socket.on('matchmaker_found', (data) => {
            App.showToast(`Match found! Joining room ${data.roomCode}`, 'success');
            document.getElementById('matchmaking-status-card').classList.add('hidden');
        });

        Multiplayer.socket.on('race_countdown', (data) => {
            const num = data.count;
            App.showToast(`Starting race in ${num}...`, 'info');
            Game.playStateSound('tick');
        });

        Multiplayer.socket.on('race_started', () => {
            Multiplayer.startRace();
        });

        Multiplayer.socket.on('opponent_progress', (data) => {
            const { id, progress, wpm } = data;
            const runner = document.getElementById(`runner-${id}`);
            const wpmLabel = document.getElementById(`wpm-${id}`);
            if (runner) runner.style.left = `${progress * 100}%`;
            if (wpmLabel) wpmLabel.textContent = `${wpm} WPM`;
        });

        Multiplayer.socket.on('opponent_finished', (data) => {
            const { username, wpm, place } = data;
            App.showToast(`🏁 ${username} finished! Place: #${place} (${wpm} WPM)`, 'info');
        });

        Multiplayer.socket.on('race_results', (data) => {
            Multiplayer.showFinalScoreboard(data.results);
        });

        Multiplayer.socket.on('new_chat_message', (data) => {
            Multiplayer.appendChatMessage(data);
        });

        Multiplayer.socket.on('opponent_left', (data) => {
            App.showToast('An opponent left the room.', 'info');
        });
    },

    startMatchmaking: () => {
        Multiplayer.ensureSocket();
        document.getElementById('matchmaking-status-card').classList.remove('hidden');
        Multiplayer.socket.emit('join_matchmaking');
    },

    cancelMatchmaking: () => {
        if (Multiplayer.socket) {
            Multiplayer.socket.emit('leave_matchmaking');
        }
        document.getElementById('matchmaking-status-card').classList.add('hidden');
    },

    resetLobbyUI: () => {
        document.querySelector('.lobby-placeholder-view').classList.remove('hidden');
        document.getElementById('active-room-interface').classList.add('hidden');
        document.getElementById('matchmaking-status-card').classList.add('hidden');
        Multiplayer.currentRoomCode = null;
    },

    onRoomJoined: (data) => {
        Multiplayer.currentRoomCode = data.roomCode;
        Multiplayer.textTarget = data.text;
        Multiplayer.isRaceActive = false;
        Multiplayer.isFinished = false;
        Multiplayer.currentIndex = 0;

        document.querySelector('.lobby-placeholder-view').classList.add('hidden');
        document.getElementById('active-room-interface').classList.remove('hidden');
        document.getElementById('room-code-label').textContent = data.roomCode;

        // Clear chats
        document.getElementById('room-chat-logs').innerHTML = '';

        Multiplayer.onPlayersUpdated(data);
    },

    onPlayersUpdated: (data) => {
        const runnersTarget = document.getElementById('multiplayer-runners');
        runnersTarget.innerHTML = '';

        data.players.forEach(p => {
            const readyStateText = p.ready ? '✅ Ready' : '⏳ Waiting';
            
            const lane = document.createElement('div');
            lane.className = 'race-lane';
            lane.innerHTML = `
                <div class="lane-header">
                    <span class="lane-runner-name">${p.username} (${readyStateText})</span>
                    <span id="wpm-${p.id}" class="lane-wpm-txt">${p.wpm} WPM</span>
                </div>
                <div class="lane-line">
                    <div id="runner-${p.id}" class="runner-avatar">${p.username === Auth.currentUser?.username ? '🏃' : '🚴'}</div>
                </div>
            `;
            runnersTarget.appendChild(lane);
        });
    },

    startRace: () => {
        Multiplayer.isRaceActive = true;
        Multiplayer.isFinished = false;
        Multiplayer.currentIndex = 0;
        Multiplayer.startTime = Date.now();

        // Reveal typing arena
        const arena = document.getElementById('multi-typing-arena-wrapper');
        arena.classList.remove('hidden');

        // Draw typing span highlights
        const target = document.getElementById('multi-typing-target');
        target.innerHTML = '';
        
        Multiplayer.textTarget.split('').forEach((char, index) => {
            const span = document.createElement('span');
            if (char === ' ') {
                span.innerHTML = '&nbsp;';
                span.classList.add('space-char');
            } else {
                span.textContent = char;
            }
            span.id = `mp-char-${index}`;
            target.appendChild(span);
        });

        Multiplayer.updateCursor();
        document.getElementById('multi-hidden-typer').focus();
    },

    updateCursor: () => {
        document.querySelectorAll('#multi-typing-target span').forEach(el => el.classList.remove('active-cursor'));
        const span = document.getElementById(`mp-char-${Multiplayer.currentIndex}`);
        if (span) {
            span.classList.add('active-cursor');
        }
    },

    handleTypingInput: (e) => {
        if (!Multiplayer.isRaceActive || Multiplayer.isFinished) return;

        const hiddenTyper = document.getElementById('multi-hidden-typer');
        const val = hiddenTyper.value;
        if (val.length === 0) return;

        Game.playClickSound();

        const inputChar = val[val.length - 1];
        const expected = Multiplayer.textTarget[Multiplayer.currentIndex];
        const span = document.getElementById(`mp-char-${Multiplayer.currentIndex}`);

        if (inputChar === expected) {
            span.classList.remove('wrong');
            span.classList.add('correct');
        } else {
            span.classList.remove('correct');
            span.classList.add('wrong');
        }

        Multiplayer.currentIndex++;

        // Calculate live WPM
        const elapsedMin = (Date.now() - Multiplayer.startTime) / 60000;
        if (elapsedMin > 0) {
            Multiplayer.myWpm = Math.floor((Multiplayer.currentIndex / 5) / elapsedMin);
            document.getElementById('mp-my-wpm').textContent = Multiplayer.myWpm;
        }

        // Animate runner
        const progress = Multiplayer.currentIndex / Multiplayer.textTarget.length;
        if (Multiplayer.socket) {
            // Send socket updates
            Multiplayer.socket.emit('race_progress', { progress, wpm: Multiplayer.myWpm });
        }

        if (Multiplayer.currentIndex >= Multiplayer.textTarget.length) {
            Multiplayer.completeRace();
        } else {
            Multiplayer.updateCursor();
        }

        hiddenTyper.value = '';
    },

    handleSpecialKeys: (e) => {
        if (e.key === 'Backspace' && Multiplayer.currentIndex > 0) {
            Game.playClickSound();
            Multiplayer.currentIndex--;
            const span = document.getElementById(`mp-char-${Multiplayer.currentIndex}`);
            span.classList.remove('correct', 'wrong');
            Multiplayer.updateCursor();
        }
    },

    completeRace: () => {
        Multiplayer.isFinished = true;
        document.getElementById('multi-typing-arena-wrapper').classList.add('hidden');
        
        const correctCount = document.querySelectorAll('#multi-typing-target span.correct').length;
        const accuracy = parseFloat(((correctCount / Multiplayer.textTarget.length) * 100).toFixed(2));
        
        Game.playStateSound('victory');

        if (Multiplayer.socket) {
            Multiplayer.socket.emit('race_finished', {
                wpm: Multiplayer.myWpm,
                accuracy
            });
        }

        App.showToast('You finished the race! Waiting for others...', 'success');
    },

    showFinalScoreboard: (results) => {
        // Format final layout
        let scoreboardHtml = `<h4>Final Race Rankings</h4><hr class="lobby-divider">`;
        results.forEach((r, idx) => {
            const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '🏃'));
            scoreboardHtml += `
                <div class="search-result-row">
                    <span>${medal} #${idx+1} ${r.username}</span>
                    <span>WPM: <b>${r.wpm}</b> | Acc: <b>${r.accuracy || 100}%</b></span>
                </div>
            `;
        });
        
        const logs = document.getElementById('room-chat-logs');
        const row = document.createElement('div');
        row.style.background = 'rgba(0, 229, 255, 0.05)';
        row.style.padding = '10px';
        row.style.borderRadius = '8px';
        row.innerHTML = scoreboardHtml;
        logs.appendChild(row);
        logs.scrollTop = logs.scrollHeight;
    },

    sendChatMessage: () => {
        const input = document.getElementById('input-room-chat');
        const text = input.value.trim();
        if (!text) return;

        Multiplayer.ensureSocket();
        Multiplayer.socket.emit('send_chat_message', {
            receiverId: null, // room-wide broadcast
            message: text
        });

        input.value = '';
    },

    appendChatMessage: (data) => {
        const logs = document.getElementById('room-chat-logs');
        const bubble = document.createElement('div');
        bubble.className = 'chat-msg-row';
        bubble.innerHTML = `<span class="chat-sender">${data.sender_username}:</span> ${data.message}`;
        logs.appendChild(bubble);
        logs.scrollTop = logs.scrollHeight;
    }
};

window.Multiplayer = Multiplayer;
