// TypeSprint Typing Engine (Practice & Local Runs)

const Game = {
    // Game configurations and State
    textTarget: "",
    currentIndex: 0,
    startTime: null,
    timerInterval: null,
    elapsedSeconds: 0,
    timeLimit: 60, // standard timer duration
    isTestActive: false,
    isTestFinished: false,

    // Performance logs
    historyWpm: [], // [{time, wpm, acc}]
    errorsCount: 0,
    backspaceCount: 0,
    errorsMap: {}, // char -> error count
    keyHeatmap: {}, // char -> {total, error}
    replayLogs: [], // [{time, index, key, isCorrect}]
    
    // Audio synthesis context
    audioCtx: null,

    // Chart.js instance reference
    runChart: null,

    init: () => {
        Game.bindEvents();
        Game.resetState();
    },

    bindEvents: () => {
        const hiddenTyper = document.getElementById('hidden-typer');
        const arena = document.getElementById('practice-typing-arena');

        // Clicking the arena triggers focus on hidden input
        arena.addEventListener('click', () => {
            hiddenTyper.focus();
            arena.querySelector('.typing-focus-hint')?.classList.add('hidden');
        });

        hiddenTyper.addEventListener('focus', () => {
            arena.querySelector('.typing-focus-hint')?.classList.add('hidden');
        });

        hiddenTyper.addEventListener('blur', () => {
            if (!Game.isTestActive) {
                arena.querySelector('.typing-focus-hint')?.classList.remove('hidden');
            }
        });

        // Key press intercepts
        hiddenTyper.addEventListener('input', Game.handleInput);
        hiddenTyper.addEventListener('keydown', Game.handleSpecialKeys);

        // Reset actions
        document.getElementById('btn-reset-arena').addEventListener('click', () => Game.startSession());
        
        // Listen to Esc key to restart quickly
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && App.currentSection === 'practice-section') {
                e.preventDefault();
                Game.startSession();
            }
        });

        // Config updates on changing tabs
        const modeBtns = document.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                modeBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Hide sub-options
                document.querySelectorAll('.sub-options').forEach(opt => opt.classList.add('hidden'));
                
                const selectedMode = e.target.getAttribute('data-mode');
                const matchingOpts = document.getElementById(`sub-options-${selectedMode}`);
                if (matchingOpts) matchingOpts.classList.remove('hidden');

                Game.startSession();
            });
        });

        const optBtns = document.querySelectorAll('.sub-options .opt-btn');
        optBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const parent = e.target.parentElement;
                parent.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                Game.startSession();
            });
        });

        // Replay and Results buttons
        document.getElementById('btn-run-replay').addEventListener('click', () => Game.playReplay());
        document.getElementById('btn-close-results').addEventListener('click', () => {
            document.getElementById('result-summary-card').classList.add('hidden');
            Game.startSession();
        });
    },

    resetState: () => {
        clearInterval(Game.timerInterval);
        Game.currentIndex = 0;
        Game.startTime = null;
        Game.elapsedSeconds = 0;
        Game.isTestActive = false;
        Game.isTestFinished = false;
        Game.historyWpm = [];
        Game.errorsCount = 0;
        Game.backspaceCount = 0;
        Game.errorsMap = {};
        Game.keyHeatmap = {};
        Game.replayLogs = [];
        
        document.getElementById('live-wpm').textContent = '00';
        document.getElementById('live-acc').textContent = '100%';
        document.getElementById('live-errors').textContent = '0';
        document.getElementById('live-timer').textContent = '--';
        document.getElementById('hidden-typer').value = '';
    },

    startSession: async () => {
        Game.resetState();
        document.getElementById('result-summary-card').classList.add('hidden');
        
        // Hide dynamic alerts
        document.getElementById('reward-claims-banner').classList.add('hidden');

        // Fetch settings config
        const selectedFont = document.getElementById('setting-font-family').value;
        const selectedFontSize = document.getElementById('setting-font-size').value;
        
        const textTargetWrapper = document.getElementById('typing-text-target');
        textTargetWrapper.style.fontFamily = selectedFont;
        textTargetWrapper.style.fontSize = selectedFontSize;

        // Fetch target modes
        const activeModeBtn = document.querySelector('.mode-btn.active');
        const mode = activeModeBtn ? activeModeBtn.getAttribute('data-mode') : 'words';

        let subVal = '';
        const subOptionWrapper = document.getElementById(`sub-options-${mode}`);
        if (subOptionWrapper) {
            const activeSub = subOptionWrapper.querySelector('.opt-btn.active');
            subVal = activeSub ? activeSub.getAttribute('data-val') : '';
        }

        textTargetWrapper.innerHTML = `<span class="loading-label">Fetching text...</span>`;

        try {
            // API text lookup
            // Mode translates to difficulty queries or language queries
            let difficulty = 'medium';
            let language = 'javascript';
            let wordCount = '25';

            if (mode === 'words') wordCount = subVal || '25';
            if (mode === 'quote') difficulty = subVal || 'medium';
            if (mode === 'code') language = subVal || 'javascript';

            const data = await API.getText(mode, difficulty, language, wordCount);
            
            Game.textTarget = data.text || data.code || "";
            if (mode === 'code') {
                // Keep carriage returns and spaces clean for code formats
                Game.textTarget = Game.textTarget.replace(/\r\n/g, '\n');
            }

            // Set countdown durations
            if (mode === 'words') {
                Game.timeLimit = parseInt(wordCount) * 4; // generous limit
            } else {
                Game.timeLimit = 60;
            }

            document.getElementById('live-timer').textContent = `${Game.timeLimit}s`;
            Game.renderTextSpans();

        } catch (error) {
            textTargetWrapper.innerHTML = `<span class="text-red">Failed to load practice. Click reset to retry.</span>`;
        }
    },

    renderTextSpans: () => {
        const wrapper = document.getElementById('typing-text-target');
        wrapper.innerHTML = '';
        
        const chars = Game.textTarget.split('');
        chars.forEach((char, index) => {
            const span = document.createElement('span');
            // Show indentation tab spaces visually
            if (char === '\n') {
                span.innerHTML = '↵<br>';
                span.classList.add('line-break-char');
            } else if (char === ' ') {
                span.innerHTML = '&nbsp;';
                span.classList.add('space-char');
            } else {
                span.textContent = char;
            }
            span.id = `char-${index}`;
            wrapper.appendChild(span);
        });

        // Set cursor to character 0
        Game.updateCursorPosition();
    },

    updateCursorPosition: () => {
        // Remove previous cursor highlights
        document.querySelectorAll('#typing-text-target span').forEach(el => {
            el.classList.remove('active-cursor');
            el.className = el.className.replace(/\bcursor-\S+/g, ''); // strip cursor style classes
        });

        const activeSpan = document.getElementById(`char-${Game.currentIndex}`);
        if (activeSpan) {
            activeSpan.classList.add('active-cursor');
            
            // Apply cursor customization shape from drawer
            const cursorShape = document.getElementById('setting-cursor').value || 'line-blink';
            activeSpan.classList.add(cursorShape);

            // Auto-scroll inside arena container if typing multi-line code
            const container = document.getElementById('practice-typing-arena');
            const relativeOffset = activeSpan.offsetTop - container.offsetTop;
            if (relativeOffset > 80) {
                container.scrollTop = relativeOffset - 50;
            } else {
                container.scrollTop = 0;
            }
        }
    },

    handleInput: (e) => {
        if (Game.isTestFinished) return;

        const hiddenTyper = document.getElementById('hidden-typer');
        const typedVal = hiddenTyper.value;
        
        if (typedVal.length === 0) return;

        // Initialize timer on first keypress
        if (!Game.isTestActive) {
            Game.isTestActive = true;
            Game.startTime = Date.now();
            Game.timerInterval = setInterval(Game.updateTimer, 1000);
        }

        const inputChar = typedVal[typedVal.length - 1];
        const expectedChar = Game.textTarget[Game.currentIndex];
        
        // Audio tick trigger
        Game.playClickSound();

        const activeSpan = document.getElementById(`char-${Game.currentIndex}`);
        
        // Heatmap monitoring details
        const keyRepresentation = expectedChar === ' ' ? 'Space' : expectedChar;
        if (!Game.keyHeatmap[keyRepresentation]) {
            Game.keyHeatmap[keyRepresentation] = { total: 0, error: 0 };
        }
        Game.keyHeatmap[keyRepresentation].total += 1;

        let isCorrect = false;

        if (inputChar === expectedChar || (expectedChar === '\n' && inputChar === ' ')) {
            // Correct letter
            isCorrect = true;
            activeSpan.classList.remove('wrong');
            activeSpan.classList.add('correct');
        } else {
            // Typo keypress
            isCorrect = false;
            activeSpan.classList.remove('correct');
            activeSpan.classList.add('wrong');
            
            Game.errorsCount++;
            document.getElementById('live-errors').textContent = Game.errorsCount;
            
            // Map mistake aggregates
            const errorChar = expectedChar === ' ' ? 'Space' : (expectedChar === '\n' ? 'Enter' : expectedChar);
            Game.errorsMap[errorChar] = (Game.errorsMap[errorChar] || 0) + 1;
            Game.keyHeatmap[keyRepresentation].error += 1;
        }

        // Log run replay step
        Game.replayLogs.push({
            time: Date.now() - Game.startTime,
            index: Game.currentIndex,
            key: inputChar,
            isCorrect
        });

        // Increment cursor
        Game.currentIndex++;
        
        // Check if finished
        if (Game.currentIndex >= Game.textTarget.length) {
            Game.completeSession();
        } else {
            Game.updateCursorPosition();
            Game.calculateLiveMetrics();
        }

        // Reset input box
        hiddenTyper.value = '';
    },

    handleSpecialKeys: (e) => {
        // Backspace handling
        if (e.key === 'Backspace') {
            if (Game.currentIndex > 0) {
                Game.playClickSound();
                Game.backspaceCount++;
                Game.currentIndex--;
                
                const activeSpan = document.getElementById(`char-${Game.currentIndex}`);
                activeSpan.classList.remove('correct', 'wrong');
                Game.updateCursorPosition();
                Game.calculateLiveMetrics();
            }
        }
    },

    updateTimer: () => {
        const elapsed = Math.floor((Date.now() - Game.startTime) / 1000);
        Game.elapsedSeconds = elapsed;
        const remaining = Game.timeLimit - elapsed;

        document.getElementById('live-timer').textContent = `${Math.max(0, remaining)}s`;

        // Calculate WPM log point every 5 seconds for chart
        if (elapsed > 0 && elapsed % 2 === 0) {
            const currentWpm = Game.getWpmCalculation();
            const currentAcc = Game.getAccuracyCalculation();
            Game.historyWpm.push({
                time: elapsed,
                wpm: currentWpm,
                accuracy: currentAcc
            });
        }

        if (remaining <= 0) {
            Game.completeSession();
        }
    },

    getWpmCalculation: () => {
        if (Game.elapsedSeconds === 0) return 0;
        
        // Calculate Gross WPM: (Typed characters / 5) / time_minutes
        const typedSpans = document.querySelectorAll('#typing-text-target span.correct, #typing-text-target span.wrong');
        const correctCount = document.querySelectorAll('#typing-text-target span.correct').length;
        
        const minutes = Game.elapsedSeconds / 60.0;
        const grossWpm = Math.floor((typedSpans.length / 5) / minutes);
        
        // Net WPM = Gross WPM - (uncorrected_errors / minutes)
        // For local simplicity, we'll return Net WPM
        const uncorrectedErrors = typedSpans.length - correctCount;
        const netWpm = Math.max(0, Math.floor(grossWpm - (uncorrectedErrors / minutes)));
        
        return netWpm;
    },

    getAccuracyCalculation: () => {
        const correctCount = document.querySelectorAll('#typing-text-target span.correct').length;
        const totalTyped = document.querySelectorAll('#typing-text-target span.correct, #typing-text-target span.wrong').length;
        
        if (totalTyped === 0) return 100;
        return parseFloat(((correctCount / totalTyped) * 100).toFixed(2));
    },

    calculateLiveMetrics: () => {
        const wpm = Game.getWpmCalculation();
        const acc = Game.getAccuracyCalculation();

        document.getElementById('live-wpm').textContent = wpm < 10 ? `0${wpm}` : wpm;
        document.getElementById('live-acc').textContent = `${acc}%`;
    },

    completeSession: async () => {
        clearInterval(Game.timerInterval);
        Game.isTestFinished = true;
        Game.isTestActive = false;

        if (Game.elapsedSeconds === 0 && Game.startTime) {
            Game.elapsedSeconds = Math.max(1, Math.floor((Date.now() - Game.startTime) / 1000));
        }

        const finalWpm = Game.getWpmCalculation();
        const finalAcc = Game.getAccuracyCalculation();
        const finalCpm = Math.floor((Game.currentIndex / (Game.elapsedSeconds || 1)) * 60);

        // Display results page values
        document.getElementById('res-wpm').textContent = finalWpm;
        document.getElementById('res-acc').textContent = `${finalAcc}%`;
        document.getElementById('res-cpm').textContent = finalCpm;
        document.getElementById('res-time').textContent = `${Game.elapsedSeconds}s`;

        document.getElementById('result-summary-card').classList.remove('hidden');

        // Play finish sound
        Game.playStateSound(finalAcc === 100.0 ? 'victory' : 'finish');

        // Fire confetti on awesome accuracy or fast speed!
        if (finalAcc >= 95.0) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }

        // Draw progress charts
        Game.drawPerformanceChart();

        // 4. API upload to server (only if user is logged in)
        if (Auth.currentUser) {
            try {
                const resultsPayload = {
                    mode: document.querySelector('.mode-btn.active').getAttribute('data-mode'),
                    wpm: finalWpm,
                    cpm: finalCpm,
                    accuracy: finalAcc,
                    errors: Game.errorsMap,
                    keyHeatmap: Game.keyHeatmap,
                    replayData: Game.replayLogs,
                    typingSeconds: Game.elapsedSeconds
                };
                
                const data = await API.submitResults(resultsPayload);
                
                // Show rewards gained
                if (data.rewards) {
                    const banner = document.getElementById('reward-claims-banner');
                    document.getElementById('reward-xp-earned').textContent = `XP +${data.rewards.xp}`;
                    document.getElementById('reward-coins-earned').textContent = `🪙 +${data.rewards.coins}`;
                    banner.classList.remove('hidden');
                }

                // Show unlocked achievements toast
                if (data.unlocked_achievements && data.unlocked_achievements.length > 0) {
                    data.unlocked_achievements.forEach(ach => {
                        App.showToast(`🏆 Unlocked Achievement: ${ach.title}!`, 'success');
                    });
                }
                
                // Check if user level changed
                Auth.checkAuthStatus();
            } catch (err) {
                console.error('Failed to submit results:', err.message);
            }
        }
    },

    drawPerformanceChart: () => {
        const ctx = document.getElementById('run-speed-chart').getContext('2d');
        
        if (Game.runChart) {
            Game.runChart.destroy();
        }

        const labels = Game.historyWpm.map(h => `${h.time}s`);
        const wpms = Game.historyWpm.map(h => h.wpm);
        const accs = Game.historyWpm.map(h => h.accuracy);

        // Fallback if the run was too short
        if (labels.length === 0) {
            labels.push('0s', `${Game.elapsedSeconds}s`);
            wpms.push(0, Game.getWpmCalculation());
            accs.push(100, Game.getAccuracyCalculation());
        }

        const isLight = document.body.classList.contains('glass-light');
        const textColor = isLight ? '#2c3e50' : '#a0aec0';

        Game.runChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'WPM',
                        data: wpms,
                        borderColor: '#00e5ff',
                        backgroundColor: 'rgba(0, 229, 255, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Accuracy (%)',
                        data: accs,
                        borderColor: '#bd00ff',
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderDash: [5, 5],
                        tension: 0.1,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { labels: { color: textColor } }
                },
                scales: {
                    x: { ticks: { color: textColor }, grid: { display: false } },
                    y: {
                        position: 'left',
                        ticks: { color: textColor },
                        title: { display: true, text: 'WPM', color: textColor }
                    },
                    y1: {
                        position: 'right',
                        ticks: { color: textColor },
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Accuracy', color: textColor },
                        min: 0, max: 100
                    }
                }
            }
        });
    },

    playReplay: () => {
        if (Game.replayLogs.length === 0) return;

        // Visual reset arena structure for playback
        Game.renderTextSpans();
        document.querySelectorAll('#typing-text-target span').forEach(el => el.classList.remove('correct', 'wrong', 'active-cursor'));
        
        let replayIdx = 0;
        
        const triggerReplayStep = () => {
            if (replayIdx >= Game.replayLogs.length) {
                App.showToast('Replay review finished.', 'info');
                // restore cursor to original end
                Game.currentIndex = Game.textTarget.length;
                Game.updateCursorPosition();
                return;
            }

            const step = Game.replayLogs[replayIdx];
            const span = document.getElementById(`char-${step.index}`);
            
            if (span) {
                // Highlight keys
                if (step.isCorrect) {
                    span.classList.add('correct');
                } else {
                    span.classList.add('wrong');
                }
                
                // Audio synthesis ticks
                Game.playClickSound();
            }

            replayIdx++;
            
            // Set next timeout delay
            const nextStep = Game.replayLogs[replayIdx];
            const delay = nextStep ? (nextStep.time - step.time) : 50;
            // Cap lag spikes in playbacks at 800ms
            setTimeout(triggerReplayStep, Math.min(800, Math.max(10, delay)));
        };

        triggerReplayStep();
    },

    // Audio sound generator using Web Audio API (Synthesizing keysounds)
    playClickSound: () => {
        const soundSetting = document.getElementById('setting-sound').value;
        const soundChecked = document.getElementById('setting-volume').checked;
        
        if (soundSetting === 'none' || !soundChecked) return;

        try {
            if (!Game.audioCtx) {
                Game.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }

            const ctx = Game.audioCtx;
            
            if (soundSetting === 'mechanical') {
                // Mechanical Click (high pass filter + noise envelope)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(150, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.05);

                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start();
                osc.stop(ctx.currentTime + 0.05);

            } else if (soundSetting === 'bubble') {
                // Bubble sound (pop modulation)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);

                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start();
                osc.stop(ctx.currentTime + 0.08);

            } else if (soundSetting === 'laser') {
                // Sci-fi Laser (frequency downward sweep)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(2000, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.12);

                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start();
                osc.stop(ctx.currentTime + 0.12);
            }
        } catch (err) {
            console.warn('Audio synthesis warning:', err);
        }
    },

    playStateSound: (type) => {
        const soundChecked = document.getElementById('setting-volume').checked;
        if (!soundChecked) return;

        try {
            if (!Game.audioCtx) {
                Game.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = Game.audioCtx;

            if (type === 'victory') {
                // Happy chord progression synthesis
                const playTone = (freq, startOffset, duration) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
                    
                    gain.gain.setValueAtTime(0.15, ctx.currentTime + startOffset);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startOffset + duration);

                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    
                    osc.start(ctx.currentTime + startOffset);
                    osc.stop(ctx.currentTime + startOffset + duration);
                };

                playTone(523.25, 0, 0.15); // C5
                playTone(659.25, 0.1, 0.15); // E5
                playTone(783.99, 0.2, 0.15); // G5
                playTone(1046.50, 0.3, 0.4); // C6

            } else {
                // General finish bell sound
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start();
                osc.stop(ctx.currentTime + 0.5);
            }
        } catch (error) {
            // Audio context locked
        }
    }
};

window.Game = Game;
