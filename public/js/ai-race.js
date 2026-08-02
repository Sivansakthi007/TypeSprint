// TypeSprint AI Race Controller

const AiRace = {
    // Race States
    textTarget: "",
    currentIndex: 0,
    startTime: null,
    timerInterval: null,
    aiInterval: null,
    isRaceFinished: false,

    // Racers metrics
    playerWpm: 0,
    playerProgress: 0, // 0.0 to 1.0
    
    aiWpm: 45,
    aiProgress: 0, // 0.0 to 1.0
    aiTickRateMs: 200, // updates AI index increments at this rate

    init: () => {
        AiRace.bindEvents();
    },

    bindEvents: () => {
        document.getElementById('btn-start-ai-race').addEventListener('click', AiRace.startRaceFlow);
        
        const hiddenTyper = document.getElementById('race-hidden-typer');
        hiddenTyper.addEventListener('input', AiRace.handleInput);
        hiddenTyper.addEventListener('keydown', AiRace.handleSpecialKeys);

        // Clicking the typing arena triggers focus
        document.getElementById('race-typing-arena-wrapper').addEventListener('click', () => {
            hiddenTyper.focus();
        });
    },

    startRaceFlow: async () => {
        // Reset states
        clearInterval(AiRace.timerInterval);
        clearInterval(AiRace.aiInterval);
        
        AiRace.currentIndex = 0;
        AiRace.playerProgress = 0;
        AiRace.aiProgress = 0;
        AiRace.isRaceFinished = false;
        
        document.getElementById('runner-player').style.left = '0%';
        document.getElementById('runner-ai').style.left = '0%';
        document.getElementById('lane-player-wpm').textContent = '0 WPM';
        document.getElementById('lane-ai-wpm').textContent = '0 WPM';

        // Load quotes or words
        const mode = document.getElementById('race-text-mode').value;
        const diff = document.getElementById('race-ai-difficulty').value;

        // Fetch AI configuration
        let targetAiWpm = 50;
        if (diff === 'easy') targetAiWpm = 25;
        else if (diff === 'medium') targetAiWpm = 50;
        else if (diff === 'hard') targetAiWpm = 75;
        else if (diff === 'expert') targetAiWpm = 100;
        else if (diff === 'impossible') targetAiWpm = 135;
        else if (diff === 'adaptive') {
            // Adaptive AI gets user's highest WPM or defaults to 60
            const userAvg = Auth.currentUser ? (Auth.currentUser.highest_wpm || 60) : 60;
            targetAiWpm = Math.max(30, userAvg);
        }

        AiRace.aiWpm = targetAiWpm;
        document.getElementById('ai-opponent-avatar-name').textContent = `🤖 AI (Level: ${diff.toUpperCase()} - ${targetAiWpm} WPM)`;

        // Fetch text target
        try {
            const data = await API.getText(mode, 'medium', 'javascript', '30');
            AiRace.textTarget = data.text || data.code || "This is a fallback race text.";
            
            // Build race arena text spans
            AiRace.renderRaceText();
            
            // Trigger countdown sequence
            AiRace.runCountdown(() => {
                AiRace.startRace();
            });

        } catch (error) {
            App.showToast('Failed to fetch race text. Please try again.', 'error');
        }
    },

    renderRaceText: () => {
        const wrapper = document.getElementById('race-typing-text-target');
        wrapper.innerHTML = '';
        
        const chars = AiRace.textTarget.split('');
        chars.forEach((char, index) => {
            const span = document.createElement('span');
            if (char === ' ') {
                span.innerHTML = '&nbsp;';
                span.classList.add('space-char');
            } else {
                span.textContent = char;
            }
            span.id = `race-char-${index}`;
            wrapper.appendChild(span);
        });

        // Set cursor
        AiRace.updateCursor();
    },

    updateCursor: () => {
        document.querySelectorAll('#race-typing-text-target span').forEach(el => el.classList.remove('active-cursor'));
        const active = document.getElementById(`race-char-${AiRace.currentIndex}`);
        if (active) {
            active.classList.add('active-cursor');
            
            // Auto scroll container
            const container = document.getElementById('race-typing-text-target');
            if (active.offsetTop > 60) {
                container.scrollTop = active.offsetTop - 30;
            } else {
                container.scrollTop = 0;
            }
        }
    },

    runCountdown: (callback) => {
        const overlay = document.getElementById('race-countdown-overlay');
        const numLabel = document.getElementById('race-countdown-number');
        overlay.classList.remove('hidden');

        let count = 3;
        numLabel.textContent = count;
        
        // play sound
        Game.playStateSound('tick');

        const timer = setInterval(() => {
            count--;
            if (count <= 0) {
                clearInterval(timer);
                overlay.classList.add('hidden');
                callback();
            } else {
                numLabel.textContent = count;
                Game.playStateSound('tick');
            }
        }, 1000);
    },

    startRace: () => {
        AiRace.startTime = Date.now();
        AiRace.isRaceFinished = false;

        document.getElementById('race-typing-arena-wrapper').classList.remove('hidden');
        document.getElementById('race-hidden-typer').focus();

        // 1. Player timer stats
        AiRace.timerInterval = setInterval(() => {
            const elapsed = (Date.now() - AiRace.startTime) / 1000;
            document.getElementById('race-live-timer').textContent = `${Math.max(0, Math.floor(60 - elapsed))}s`;
            
            if (elapsed >= 60) {
                AiRace.finishRace(false);
            }
        }, 1000);

        // 2. AI typist simulator
        // AI speed: wpm = words per minute -> chars per sec = (wpm * 5) / 60
        // AI index increment rate: every tickRateMs
        const charsPerTick = (AiRace.aiWpm * 5 / 60) * (AiRace.aiTickRateMs / 1000);
        let simulatedIndex = 0;

        AiRace.aiInterval = setInterval(() => {
            if (AiRace.isRaceFinished) return;

            // Adaptive difficulty adjusts AI speed on the fly!
            const diff = document.getElementById('race-ai-difficulty').value;
            if (diff === 'adaptive' && AiRace.playerWpm > 0) {
                // Adjust AI WPM to hover around player WPM
                const errorOffset = Math.random() > 0.5 ? 4 : -4;
                AiRace.aiWpm = Math.max(30, Math.floor(AiRace.playerWpm + errorOffset));
                document.getElementById('ai-opponent-avatar-name').textContent = `🤖 AI (Level: ADAPTIVE - ${AiRace.aiWpm} WPM)`;
            }

            simulatedIndex += charsPerTick;
            const floorIdx = Math.floor(simulatedIndex);

            AiRace.aiProgress = Math.min(1.0, floorIdx / AiRace.textTarget.length);
            
            // Move AI runner
            document.getElementById('runner-ai').style.left = `${AiRace.aiProgress * 100}%`;
            document.getElementById('lane-ai-wpm').textContent = `${AiRace.aiWpm} WPM`;

            if (AiRace.aiProgress >= 1.0) {
                AiRace.finishRace(false); // Bot won!
            }
        }, AiRace.aiTickRateMs);
    },

    handleInput: (e) => {
        if (AiRace.isRaceFinished) return;

        const hiddenTyper = document.getElementById('race-hidden-typer');
        const typedVal = hiddenTyper.value;
        if (typedVal.length === 0) return;

        // Play click sound
        Game.playClickSound();

        const inputChar = typedVal[typedVal.length - 1];
        const expectedChar = AiRace.textTarget[AiRace.currentIndex];
        const span = document.getElementById(`race-char-${AiRace.currentIndex}`);

        if (inputChar === expectedChar) {
            span.classList.remove('wrong');
            span.classList.add('correct');
        } else {
            span.classList.remove('correct');
            span.classList.add('wrong');
        }

        AiRace.currentIndex++;
        
        // Calculate player progress and animate runner
        AiRace.playerProgress = AiRace.currentIndex / AiRace.textTarget.length;
        document.getElementById('runner-player').style.left = `${AiRace.playerProgress * 100}%`;

        // Calculate live WPM
        const elapsedMinutes = (Date.now() - AiRace.startTime) / 60000;
        if (elapsedMinutes > 0) {
            AiRace.playerWpm = Math.floor((AiRace.currentIndex / 5) / elapsedMinutes);
            document.getElementById('lane-player-wpm').textContent = `${AiRace.playerWpm} WPM`;
            document.getElementById('race-live-wpm').textContent = AiRace.playerWpm;
        }

        // Calculate accuracy
        const correctCount = document.querySelectorAll('#race-typing-text-target span.correct').length;
        const accuracy = totalTyped => totalTyped === 0 ? 100 : parseFloat(((correctCount / totalTyped) * 100).toFixed(2));
        document.getElementById('race-live-acc').textContent = `${accuracy(AiRace.currentIndex)}%`;

        if (AiRace.currentIndex >= AiRace.textTarget.length) {
            AiRace.finishRace(true); // Player won!
        } else {
            AiRace.updateCursor();
        }

        hiddenTyper.value = '';
    },

    handleSpecialKeys: (e) => {
        if (e.key === 'Backspace' && AiRace.currentIndex > 0) {
            Game.playClickSound();
            AiRace.currentIndex--;
            const span = document.getElementById(`race-char-${AiRace.currentIndex}`);
            span.classList.remove('correct', 'wrong');
            AiRace.updateCursor();
        }
    },

    finishRace: async (playerWon) => {
        AiRace.isRaceFinished = true;
        clearInterval(AiRace.timerInterval);
        clearInterval(AiRace.aiInterval);

        const elapsedSeconds = Math.floor((Date.now() - AiRace.startTime) / 1000);
        const finalWpm = AiRace.playerWpm;
        const correctCount = document.querySelectorAll('#race-typing-text-target span.correct').length;
        const finalAcc = AiRace.currentIndex === 0 ? 100 : parseFloat(((correctCount / AiRace.currentIndex) * 100).toFixed(2));

        document.getElementById('race-typing-arena-wrapper').classList.add('hidden');

        if (playerWon) {
            Game.playStateSound('victory');
            confetti({
                particleCount: 150,
                spread: 80,
                origin: { y: 0.6 }
            });
            App.showToast(`🥇 Victory! You beat the AI at ${finalWpm} WPM!`, 'success');
        } else {
            Game.playStateSound('finish');
            App.showToast(`🥈 Bot finished first! Try again.`, 'info');
        }

        // If logged in, submit results to count games and earn coins
        if (Auth.currentUser) {
            try {
                await API.submitResults({
                    mode: 'race',
                    wpm: finalWpm,
                    cpm: finalWpm * 5,
                    accuracy: finalAcc,
                    errors: {},
                    keyHeatmap: {},
                    replayData: [],
                    typingSeconds: elapsedSeconds
                });
                
                // Show updated profile details
                Auth.checkAuthStatus();
            } catch (err) {
                console.error('Failed uploading race stats:', err);
            }
        }
    }
};

window.AiRace = AiRace;
