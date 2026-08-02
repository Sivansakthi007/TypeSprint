// TypeSprint Main Orchestrator & Client Router

const App = {
    currentSection: 'home-section',
    profileTrendChart: null,

    init: () => {
        App.bindRouting();
        App.bindDrawerEvents();
        App.loadSettings();
        
        // Hide splash screen after 1.5 seconds
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.style.opacity = '0';
                setTimeout(() => splash.classList.add('hidden'), 500);
            }
        }, 1200);

        // Initialize component sub-modules
        Auth.init();
        Game.init();
        AiRace.init();
        Multiplayer.init();
        Shop.init();
        Social.init();
        Admin.init();

        // Default: Load home
        App.loadSection('home-section');
    },

    bindRouting: () => {
        // Navbar anchors
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                navItems.forEach(n => n.classList.remove('active'));
                e.target.classList.add('active');

                const targetSection = e.target.getAttribute('data-target');
                App.loadSection(targetSection);
            });
        });

        // Logo click routing
        document.getElementById('nav-brand-logo').addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            document.querySelector('.nav-item[data-target="home-section"]').classList.add('active');
            App.loadSection('home-section');
        });

        // Quick practice/race redirect buttons from Home view
        document.querySelectorAll('.btn-hero-start, .btn-hero-race').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.getAttribute('data-target');
                navItems.forEach(n => n.classList.remove('active'));
                document.querySelector(`.nav-item[data-target="${target}"]`).classList.add('active');
                App.loadSection(target);
            });
        });

        // User pill click routing (Redirects to Profile page)
        document.getElementById('user-profile-trigger').addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            document.querySelector('.nav-item[data-target="profile-section"]').classList.add('active');
            App.loadSection('profile-section');
        });
    },

    loadSection: (sectionId) => {
        App.currentSection = sectionId;
        
        // Hide all views
        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.remove('active');
        });

        // Display current view
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Section trigger initialization hooks
        if (sectionId === 'practice-section') {
            Game.startSession();
        } else if (sectionId === 'shop-section') {
            Shop.loadShop();
        } else if (sectionId === 'social-section') {
            if (Auth.currentUser) {
                Social.loadSocialPanel();
            } else {
                App.showToast('Please sign in to access friends and chats.', 'info');
                Auth.showModal(true);
                App.loadSection('home-section');
            }
        } else if (sectionId === 'profile-section') {
            if (Auth.currentUser) {
                App.loadUserProfileDashboard();
            } else {
                App.showToast('Please sign in to view statistics.', 'info');
                Auth.showModal(true);
                App.loadSection('home-section');
            }
        } else if (sectionId === 'admin-section') {
            Admin.loadDashboard();
        }
    },

    bindDrawerEvents: () => {
        const drawer = document.getElementById('settings-drawer');
        const btnToggle = document.getElementById('btn-settings-toggle');
        const btnClose = document.getElementById('btn-settings-close');
        const btnSave = document.getElementById('btn-save-settings');

        btnToggle.addEventListener('click', () => drawer.classList.add('open'));
        btnClose.addEventListener('click', () => drawer.classList.remove('open'));
        btnSave.addEventListener('click', () => {
            App.saveSettings();
            drawer.classList.remove('open');
            App.showToast('Settings saved successfully.', 'success');
        });
    },

    loadSettings: () => {
        const theme = localStorage.getItem('setting-theme') || 'glass-dark';
        const fontFamily = localStorage.getItem('setting-font-family') || 'Inter, sans-serif';
        const fontSize = localStorage.getItem('setting-font-size') || '1.5rem';
        const cursor = localStorage.getItem('setting-cursor') || 'line-blink';
        const sound = localStorage.getItem('setting-sound') || 'mechanical';
        const volume = localStorage.getItem('setting-volume') !== 'false';
        const animations = localStorage.getItem('setting-animations') !== 'false';

        // Apply visual theme to body element
        document.body.className = '';
        document.body.classList.add(theme);

        // Map drawer variables
        document.getElementById('setting-theme').value = theme;
        document.getElementById('setting-font-family').value = fontFamily;
        document.getElementById('setting-font-size').value = fontSize;
        document.getElementById('setting-cursor').value = cursor;
        document.getElementById('setting-sound').value = sound;
        document.getElementById('setting-volume').checked = volume;
        document.getElementById('setting-animations').checked = animations;
    },

    saveSettings: () => {
        const theme = document.getElementById('setting-theme').value;
        const fontFamily = document.getElementById('setting-font-family').value;
        const fontSize = document.getElementById('setting-font-size').value;
        const cursor = document.getElementById('setting-cursor').value;
        const sound = document.getElementById('setting-sound').value;
        const volume = document.getElementById('setting-volume').checked;
        const animations = document.getElementById('setting-animations').checked;

        localStorage.setItem('setting-theme', theme);
        localStorage.setItem('setting-font-family', fontFamily);
        localStorage.setItem('setting-font-size', fontSize);
        localStorage.setItem('setting-cursor', cursor);
        localStorage.setItem('setting-sound', sound);
        localStorage.setItem('setting-volume', volume);
        localStorage.setItem('setting-animations', animations);

        // Apply variables
        document.body.className = '';
        document.body.classList.add(theme);
    },

    loadUserProfileDashboard: async () => {
        try {
            // Load user profile details
            const data = await API.getProfile();
            const prof = data.profile;
            
            // Format headers
            document.getElementById('profile-display-name').textContent = prof.display_name || prof.username;
            document.getElementById('profile-user-bio').textContent = prof.bio || "Write some bio details here...";
            document.getElementById('profile-user-country').textContent = `🌍 ${prof.country || 'Global'}`;
            
            const joinDate = new Date(prof.created_at).toLocaleDateString([], { year: 'numeric', month: 'long' });
            document.getElementById('profile-user-joined').textContent = `📅 Joined ${joinDate}`;

            // Avatar and Badge equipper updates
            const avatar = prof.avatar || 'default';
            document.getElementById('profile-avatar-img').src = `/assets/images/avatar-${avatar}.svg`;

            const badgeEmojiMap = {
                'novice': '🎖️ Novice',
                'speed-demon': '⚡ Speed Demon',
                'perfectionist': '🎯 Perfectionist',
                'typing-legend': '👑 Typing Legend',
                'terminal-hacker': '💻 Hacker'
            };
            const equippedBadgeText = badgeEmojiMap[prof.equipped_badge] || '🎖️ Novice';
            document.getElementById('profile-badge-slot').textContent = equippedBadgeText;

            // Level circle details
            document.getElementById('profile-level-txt').textContent = `Lv.${prof.typing_level}`;
            document.getElementById('profile-xp-current').textContent = `${prof.xp} XP`;
            document.getElementById('profile-xp-required').textContent = `${prof.xp_for_next_level} XP`;
            
            // Calculate progress fraction
            const levelMinXp = Math.pow(prof.typing_level - 1, 2) * 100;
            const rangeXp = prof.xp_for_next_level - levelMinXp;
            const progressXp = prof.xp - levelMinXp;
            const fillPct = Math.max(0, Math.min(100, (progressXp / (rangeXp || 1)) * 100));
            document.getElementById('profile-xp-bar-fill').style.width = `${fillPct}%`;

            // Setup profile editing form fields
            document.getElementById('edit-display-name').value = prof.display_name || "";
            document.getElementById('edit-country').value = prof.country || "";
            document.getElementById('edit-bio').value = prof.bio || "";
            document.getElementById('edit-avatar').value = avatar;

            // Load aggregate statistics counts
            const stats = await API.getStats();
            const agg = stats.aggregate;

            document.getElementById('stat-high-wpm').textContent = agg.highest_wpm;
            document.getElementById('stat-high-acc').textContent = `${agg.highest_accuracy}%`;
            document.getElementById('stat-streak').textContent = agg.current_streak;
            document.getElementById('stat-games').textContent = agg.games_played;
            
            const typingMin = Math.ceil(agg.typing_seconds / 60);
            document.getElementById('stat-time').textContent = `${typingMin}m`;
            document.getElementById('stat-coins').textContent = prof.coins;

            // Render Achievements
            App.renderProfileAchievements(data.achievements);

            // Render keyboard Heatmap
            const heatmapData = await API.getHeatmap();
            App.renderKeyboardHeatmap(heatmapData.heatmap);

            // Render charts
            App.drawProfileTrendChart(stats.history);

            // Re-bind save updates
            const btnSave = document.getElementById('btn-save-profile-edits');
            btnSave.onclick = async () => {
                const displayName = document.getElementById('edit-display-name').value;
                const country = document.getElementById('edit-country').value;
                const bio = document.getElementById('edit-bio').value;
                const avatarSel = document.getElementById('edit-avatar').value;

                try {
                    await API.updateProfile(displayName, country, bio, avatarSel);
                    App.showToast('Profile saved successfully.', 'success');
                    Auth.checkAuthStatus();
                    App.loadUserProfileDashboard();
                } catch (err) {
                    App.showToast(err.message, 'error');
                }
            };

            // Bind exports
            document.getElementById('btn-export-csv').onclick = () => App.exportCSVReport(stats.history);
            document.getElementById('btn-print-report').onclick = () => App.exportPDFReport(prof, agg);

        } catch (error) {
            console.error('Failed to load user profile dashboard:', error);
        }
    },

    renderProfileAchievements: (achs) => {
        const wrapper = document.getElementById('profile-achievements-target');
        wrapper.innerHTML = '';

        if (achs.length === 0) {
            wrapper.innerHTML = `<div class="shortcuts-legend">Complete races to unlock achievements.</div>`;
            return;
        }

        const iconMap = {
            'runner': '🏃', 'speed': '⚡', 'bolt': '⚡', 'fire': '🔥', 'rocket': '🚀',
            'bullseye': '🎯', 'shield': '🛡️', 'calendar': '📅', 'award': '🏆', 'wallet': '🪙', 'trophy': '🏆'
        };

        achs.forEach(ach => {
            const card = document.createElement('div');
            card.className = 'ach-badge-card';
            card.title = `${ach.title}: ${ach.description} (Reward: 🪙${ach.reward_coins})`;
            
            const icon = iconMap[ach.icon] || '🏅';
            card.innerHTML = `
                <span class="ach-badge-icon">${icon}</span>
                <span class="ach-badge-title">${ach.title}</span>
            `;
            wrapper.appendChild(card);
        });
    },

    renderKeyboardHeatmap: (heatmap) => {
        const wrapper = document.getElementById('visual-heatmap-keyboard');
        wrapper.innerHTML = '';

        // Standard QWERTY layout representation rows
        const rows = [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'],
            ['Space']
        ];

        rows.forEach(r => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'heatmap-row';
            
            r.forEach(key => {
                const keyDiv = document.createElement('div');
                keyDiv.className = 'heatmap-key';
                keyDiv.textContent = key === 'Space' ? 'SPACEBAR' : key;
                
                if (key === 'Space') {
                    keyDiv.style.maxWidth = '150px';
                }

                // Check heatmap data
                const val = heatmap[key.toLowerCase()] || heatmap[key];
                if (val && val.total > 0) {
                    const errRate = val.error / val.total;
                    
                    // Assign glowing background colors depending on errors density
                    if (errRate > 0.25) {
                        // High error: vibrant red
                        keyDiv.style.background = 'rgba(255, 51, 102, 0.6)';
                        keyDiv.style.borderColor = 'rgba(255, 51, 102, 0.8)';
                        keyDiv.style.color = '#fff';
                    } else if (errRate > 0.1) {
                        // Medium error: orange
                        keyDiv.style.background = 'rgba(247, 127, 0, 0.5)';
                        keyDiv.style.borderColor = 'rgba(247, 127, 0, 0.7)';
                        keyDiv.style.color = '#fff';
                    } else {
                        // Healthy: green
                        keyDiv.style.background = 'rgba(0, 255, 170, 0.35)';
                        keyDiv.style.borderColor = 'rgba(0, 255, 170, 0.6)';
                        keyDiv.style.color = '#fff';
                    }
                }

                rowDiv.appendChild(keyDiv);
            });
            
            wrapper.appendChild(rowDiv);
        });
    },

    drawProfileTrendChart: (history) => {
        const ctx = document.getElementById('profile-wpm-trends-chart').getContext('2d');
        
        if (App.profileTrendChart) {
            App.profileTrendChart.destroy();
        }

        // reverse history log to show progression chronologically (left-to-right)
        const chron = [...history].reverse().slice(-15); // last 15 games
        
        const labels = chron.map((h, idx) => `Run #${idx+1}`);
        const wpms = chron.map(h => h.wpm);
        const accs = chron.map(h => h.accuracy);

        // Fallback
        if (labels.length === 0) {
            labels.push('No Runs');
            wpms.push(0);
            accs.push(0);
        }

        App.profileTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'WPM History',
                        data: wpms,
                        borderColor: '#00e5ff',
                        backgroundColor: 'rgba(0, 229, 255, 0.05)',
                        borderWidth: 2,
                        tension: 0.2
                    },
                    {
                        label: 'Accuracy (%)',
                        data: accs,
                        borderColor: '#bd00ff',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { labels: { color: '#a0aec0' } }
                },
                scales: {
                    x: { ticks: { color: '#a0aec0' }, grid: { display: false } },
                    y: { ticks: { color: '#a0aec0' } }
                }
            }
        });
    },

    exportCSVReport: (history) => {
        if (history.length === 0) return App.showToast('No typing stats available to export.', 'error');

        let csv = 'Run ID,Date,Mode,WPM,CPM,Accuracy (%)\n';
        history.forEach((h, idx) => {
            const dateStr = new Date(h.created_at).toLocaleDateString();
            csv += `${history.length - idx},${dateStr},${h.mode},${h.wpm},${h.cpm},${h.accuracy}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `typesprint_report_${Auth.currentUser.username}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        App.showToast('CSV report generated and downloaded.', 'success');
    },

    exportPDFReport: (profile, agg) => {
        // Opens clean printer-friendly layout for certification sheets
        const printWindow = window.open('', '_blank');
        
        const dateStr = new Date().toLocaleDateString();

        printWindow.document.write(`
            <html>
            <head>
                <title>TypeSprint Professional Performance Certificate</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #2c3e50; }
                    .cert-border { border: 8px double #bd00ff; padding: 40px; text-align: center; border-radius: 12px; }
                    .cert-title { font-size: 32px; font-weight: bold; margin-bottom: 20px; color: #1a1a2e; }
                    .sub { font-size: 18px; margin-bottom: 40px; }
                    .name { font-size: 28px; font-weight: bold; text-decoration: underline; margin-bottom: 30px; }
                    .metric-table { width: 80%; margin: 30px auto; border-collapse: collapse; }
                    .metric-table th, .metric-table td { padding: 12px; border: 1px solid #ddd; text-align: center; }
                    .metric-table th { background: #f8f9fa; }
                    .footer-txt { margin-top: 50px; font-size: 12px; color: #7f8c8d; }
                </style>
            </head>
            <body>
                <div class="cert-border">
                    <div class="cert-title">⚡ TypeSprint Typing Certificate</div>
                    <div class="sub">This performance report confirms that</div>
                    <div class="name">${profile.display_name || profile.username}</div>
                    <div>has completed extensive typing races and reached the following metrics:</div>
                    
                    <table class="metric-table">
                        <thead>
                            <tr>
                                <th>Typing Level</th>
                                <th>Highest Speed</th>
                                <th>Highest Accuracy</th>
                                <th>Total Runs Completed</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Level ${profile.typing_level}</td>
                                <td>${agg.highest_wpm} WPM</td>
                                <td>${agg.highest_accuracy}%</td>
                                <td>${agg.games_played} Sessions</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="footer-txt">Generated on ${dateStr} by TypeSprint AI metrics module. Verified client key.</div>
                </div>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    showToast: (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Initialize app when DOM is fully loaded
window.addEventListener('DOMContentLoaded', () => {
    App.init();

    // Register PWA service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(() => console.log('PWA Service Worker registered successfully.'))
            .catch((err) => console.warn('Service worker registration failed:', err));
    }
});

window.App = App;
