require('dotenv').config();
const pg = require('pg');

const config = {
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '54432'), // default postgres port or custom
    database: process.env.DB_NAME || 'typesprint',
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

let pool;
let isMockDatabase = false;

// Mock database storage in case Postgres is not available
const mockDb = {
    users: [],
    profiles: {},
    typing_results: [],
    achievements: [],
    user_achievements: {},
    friends: [],
    friend_requests: [],
    chats: [],
    quotes: [],
    programming_texts: [],
    missions: [],
    user_missions: {},
    shop_items: [],
    purchases: {}
};

// Seed mock data for out-of-the-box offline/no-DB usage
function seedMockDb() {
    mockDb.shop_items = [
        { id: 'theme-neon', category: 'theme', name: 'Neon Cyberpunk', price: 300, value: 'neon-cyberpunk', preview_color: '#ff0055' },
        { id: 'theme-sakura', category: 'theme', name: 'Sakura Blossom', price: 250, value: 'sakura-blossom', preview_color: '#ffb3c6' },
        { id: 'theme-carbon', category: 'theme', name: 'Carbon Dark', price: 150, value: 'carbon-dark', preview_color: '#2a2d34' },
        { id: 'theme-forest', category: 'theme', name: 'Mossy Forest', price: 200, value: 'mossy-forest', preview_color: '#31572c' },
        { id: 'theme-sunset', category: 'theme', name: 'Sunset Glow', price: 250, value: 'sunset-glow', preview_color: '#f77f00' },
        { id: 'theme-glass-light', category: 'theme', name: 'Glass Light', price: 100, value: 'glass-light', preview_color: '#e0e1dd' },
        { id: 'cursor-block', category: 'cursor', name: 'Block Cursor', price: 100, value: 'block-solid', preview_color: '#ffffff' },
        { id: 'cursor-pulse', category: 'cursor', name: 'Pulsing Line', price: 150, value: 'line-pulse', preview_color: '#ff0055' },
        { id: 'cursor-underline', category: 'cursor', name: 'Underline', price: 100, value: 'cursor-underline', preview_color: '#00ffcc' },
        { id: 'badge-speed-demon', category: 'badge', name: 'Speed Demon', price: 500, value: 'speed-demon', preview_color: '⚡' },
        { id: 'badge-perfectionist', category: 'badge', name: 'Perfectionist', price: 500, value: 'perfectionist', preview_color: '🎯' },
        { id: 'badge-legend', category: 'badge', name: 'Typing Legend', price: 1000, value: 'typing-legend', preview_color: '👑' },
        { id: 'badge-hacker', category: 'badge', name: 'Terminal Hacker', price: 400, value: 'terminal-hacker', preview_color: '💻' }
    ];

    mockDb.achievements = [
        { id: 'first-game', title: 'First Steps', description: 'Complete your very first typing practice session.', reward_coins: 50, reward_xp: 100, icon: 'runner' },
        { id: 'wpm-80', title: 'Speedy Typer', description: 'Reach 80 Words Per Minute (WPM) in any practice mode.', reward_coins: 100, reward_xp: 150, icon: 'speed' },
        { id: 'wpm-100', title: 'Centurion Speed', description: 'Reach 100 Words Per Minute (WPM) in any practice mode.', reward_coins: 200, reward_xp: 300, icon: 'bolt' },
        { id: 'wpm-120', title: 'Keyboard Warrior', description: 'Reach 120 Words Per Minute (WPM) in any practice mode.', reward_coins: 400, reward_xp: 500, icon: 'fire' },
        { id: 'wpm-150', title: 'Sonic Fingertips', description: 'Reach 150 Words Per Minute (WPM) in any practice mode.', reward_coins: 1000, reward_xp: 1000, icon: 'rocket' },
        { id: 'accuracy-100', title: 'Perfect Flow', description: 'Complete a session with 100% typing accuracy.', reward_coins: 300, reward_xp: 400, icon: 'bullseye' },
        { id: 'no-mistakes', title: 'No Room for Error', description: 'Complete a text without a single backspace or error.', reward_coins: 500, reward_xp: 600, icon: 'shield' },
        { id: 'streak-7', title: 'Dedicated Typer', description: 'Maintain a 7-day typing practice streak.', reward_coins: 400, reward_xp: 500, icon: 'calendar' }
    ];

    mockDb.missions = [
        { id: 'daily-3-games', type: 'daily', title: 'Daily Routine', description: 'Complete 3 typing practice sessions today.', target_value: 3, target_type: 'games', reward_coins: 50, reward_xp: 100 },
        { id: 'daily-wpm-60', type: 'daily', title: 'Pushing Limits', description: 'Reach 60 WPM in any typing mode.', target_value: 60, target_type: 'wpm', reward_coins: 40, reward_xp: 80 },
        { id: 'daily-time-300', type: 'daily', title: 'Dedication', description: 'Spend a total of 5 minutes typing in practices.', target_value: 300, target_type: 'seconds', reward_coins: 60, reward_xp: 120 },
        { id: 'weekly-20-games', type: 'weekly', title: 'Weekly Grind', description: 'Complete 20 typing sessions this week.', target_value: 20, target_type: 'games', reward_coins: 300, reward_xp: 500 },
        { id: 'weekly-accuracy-98', type: 'weekly', title: 'Sniper Fingertips', description: 'Complete a test with at least 98% accuracy.', target_value: 98, target_type: 'accuracy', reward_coins: 200, reward_xp: 400 }
    ];

    mockDb.quotes = [
        { id: 1, text: 'The quick brown fox jumps over the lazy dog.', author: 'English Pangram', difficulty: 'easy' },
        { id: 2, text: 'To be or not to be, that is the question.', author: 'William Shakespeare', difficulty: 'easy' },
        { id: 3, text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill', difficulty: 'medium' },
        { id: 4, text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein', difficulty: 'medium' },
        { id: 5, text: 'The best way to predict the future is to invent it.', author: 'Alan Kay', difficulty: 'medium' },
        { id: 6, text: 'Design is not just what it looks like and feels like. Design is how it works.', author: 'Steve Jobs', difficulty: 'hard' }
    ];

    mockDb.programming_texts = [
        { id: 1, language: 'javascript', code: 'const express = require(\'express\');\nconst app = express();\n\napp.get(\'/api/health\', (req, res) => {\n    res.json({ status: \'UP\' });\n});', title: 'Express Setup', difficulty: 'medium' },
        { id: 2, language: 'python', code: 'def quick_sort(arr):\n    if len(arr) <= 1: return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quick_sort(left) + middle + quick_sort(right)', title: 'Quick Sort', difficulty: 'hard' },
        { id: 3, language: 'html', code: '<!DOCTYPE html>\n<html>\n<head>\n    <title>TypeSprint</title>\n</head>\n<body>\n    <h1>TypeSprint</h1>\n</body>\n</html>', title: 'HTML Boilerplate', difficulty: 'easy' },
        { id: 4, language: 'css', code: '.glass-card {\n    background: rgba(255, 255, 255, 0.05);\n    backdrop-filter: blur(12px);\n    border: 1px solid rgba(255, 255, 255, 0.1);\n}', title: 'Glassmorphism Style', difficulty: 'easy' }
    ];
}

// Check connection on start
try {
    pool = new pg.Pool(config);
    pool.query('SELECT NOW()', (err, res) => {
        if (err) {
            console.warn('⚠️ WARNING: Failed to connect to PostgreSQL. Falling back to In-Memory mock database. Error details:', err.message);
            isMockDatabase = true;
            seedMockDb();
        } else {
            console.log('✅ Connected to PostgreSQL Database successfully.');
        }
    });
} catch (error) {
    console.warn('⚠️ WARNING: Exception while initializing PostgreSQL client. Falling back to mock database.', error.message);
    isMockDatabase = true;
    seedMockDb();
}

/**
 * Execute a query. Automatically intercepts and maps queries to mockDb if isMockDatabase is true.
 */
async function query(text, params = []) {
    if (!isMockDatabase) {
        try {
            return await pool.query(text, params);
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    // Mock query runner for essential SQL syntax mapping
    // This allows full application run features without PostgreSQL installed locally.
    const sqlLower = text.toLowerCase().trim();
    
    // User insert
    if (sqlLower.startsWith('insert into users')) {
        const username = params[0];
        const email = params[1];
        const hash = params[2];
        const user = { id: mockDb.users.length + 1, username, email, password_hash: hash, role: 'user', created_at: new Date() };
        mockDb.users.push(user);
        
        // Auto create profile
        mockDb.profiles[user.id] = {
            user_id: user.id,
            display_name: username,
            country: 'Global',
            bio: '',
            avatar: 'default',
            typing_level: 1,
            xp: 0,
            coins: 100, // starting coins
            highest_wpm: 0,
            highest_accuracy: 0,
            current_streak: 0,
            longest_streak: 0,
            games_played: 0,
            games_won: 0,
            typing_seconds: 0,
            equipped_theme: 'glass-dark',
            equipped_cursor: 'line-blink',
            equipped_skin: 'default',
            equipped_badge: 'novice',
            last_active: new Date()
        };
        mockDb.purchases[user.id] = [];
        mockDb.user_achievements[user.id] = [];
        
        // Initialize user missions
        mockDb.user_missions[user.id] = mockDb.missions.map(m => ({
            mission_id: m.id,
            progress: 0,
            completed: false
        }));

        return { rows: [user] };
    }

    // User lookup
    if (sqlLower.startsWith('select * from users where username =') || sqlLower.includes('username = $1')) {
        const username = params[0];
        const user = mockDb.users.find(u => u.username === username);
        return { rows: user ? [user] : [] };
    }

    if (sqlLower.startsWith('select * from users where email =') || sqlLower.includes('email = $1')) {
        const email = params[0];
        const user = mockDb.users.find(u => u.email === email);
        return { rows: user ? [user] : [] };
    }

    if (sqlLower.startsWith('select * from users where id =') || sqlLower.includes('users.id = $1') || sqlLower.includes('where id = $1')) {
        const id = parseInt(params[0]);
        const user = mockDb.users.find(u => u.id === id);
        return { rows: user ? [user] : [] };
    }

    // Join profiles and users
    if (sqlLower.includes('join profiles') && sqlLower.includes('where u.id = $1')) {
        const id = parseInt(params[0]);
        const user = mockDb.users.find(u => u.id === id);
        const profile = mockDb.profiles[id];
        if (user && profile) {
            return { rows: [{ ...user, ...profile }] };
        }
        return { rows: [] };
    }

    // Profile lookup
    if (sqlLower.startsWith('select * from profiles where user_id =') || sqlLower.includes('user_id = $1')) {
        const userId = parseInt(params[0]);
        const profile = mockDb.profiles[userId];
        return { rows: profile ? [profile] : [] };
    }

    // Update profile
    if (sqlLower.startsWith('update profiles')) {
        // Simple mock mapper
        const userId = parseInt(params[params.length - 1]);
        const profile = mockDb.profiles[userId];
        if (profile) {
            if (sqlLower.includes('display_name = $1')) profile.display_name = params[0];
            if (sqlLower.includes('country = $2')) profile.country = params[1];
            if (sqlLower.includes('bio = $3')) profile.bio = params[2];
            if (sqlLower.includes('avatar = $4')) profile.avatar = params[3];
            
            // Stats updates
            if (sqlLower.includes('xp =') && sqlLower.includes('coins =')) {
                // Bulk update from result sub
                // find params by variable mapping or hardcode mock modification
                // Params: [xp, coins, wpm, accuracy, seconds, userId]
                profile.xp = params[0];
                profile.coins = params[1];
                if (params[2] > profile.highest_wpm) profile.highest_wpm = params[2];
                if (params[3] > profile.highest_accuracy) profile.highest_accuracy = parseFloat(params[3]);
                profile.games_played += 1;
                profile.typing_seconds += params[4];
            }
            return { rows: [profile] };
        }
    }

    // Quotes lookup
    if (sqlLower.startsWith('select * from quotes')) {
        if (sqlLower.includes('difficulty = $1')) {
            const difficulty = params[0];
            const filtered = mockDb.quotes.filter(q => q.difficulty === difficulty);
            return { rows: filtered };
        }
        return { rows: mockDb.quotes };
    }

    // Programming Texts lookup
    if (sqlLower.startsWith('select * from programming_texts')) {
        if (sqlLower.includes('language = $1')) {
            const language = params[0];
            const filtered = mockDb.programming_texts.filter(t => t.language === language);
            return { rows: filtered };
        }
        return { rows: mockDb.programming_texts };
    }

    // Achievements lookup
    if (sqlLower.startsWith('select * from achievements')) {
        return { rows: mockDb.achievements };
    }

    // User achievements lookup
    if (sqlLower.includes('user_achievements') && sqlLower.includes('user_id = $1')) {
        const userId = parseInt(params[0]);
        const userAchs = mockDb.user_achievements[userId] || [];
        const rows = userAchs.map(achId => {
            const detail = mockDb.achievements.find(a => a.id === achId);
            return { ...detail, unlocked_at: new Date() };
        });
        return { rows };
    }

    // Insert user achievement
    if (sqlLower.includes('insert into user_achievements')) {
        const userId = parseInt(params[0]);
        const achId = params[1];
        if (!mockDb.user_achievements[userId]) mockDb.user_achievements[userId] = [];
        if (!mockDb.user_achievements[userId].includes(achId)) {
            mockDb.user_achievements[userId].push(achId);
        }
        return { rows: [{ user_id: userId, achievement_id: achId }] };
    }

    // Shop items lookup
    if (sqlLower.startsWith('select * from shop_items')) {
        return { rows: mockDb.shop_items };
    }

    // User purchases lookup
    if (sqlLower.includes('from purchases') && sqlLower.includes('user_id = $1')) {
        const userId = parseInt(params[0]);
        const list = mockDb.purchases[userId] || [];
        return { rows: list.map(itemId => ({ item_id: itemId, purchased_at: new Date() })) };
    }

    // Insert purchase
    if (sqlLower.includes('insert into purchases')) {
        const userId = parseInt(params[0]);
        const itemId = params[1];
        if (!mockDb.purchases[userId]) mockDb.purchases[userId] = [];
        if (!mockDb.purchases[userId].includes(itemId)) {
            mockDb.purchases[userId].push(itemId);
        }
        return { rows: [{ user_id: userId, item_id: itemId }] };
    }

    // Typing Results insertion
    if (sqlLower.startsWith('insert into typing_results')) {
        // [user_id, mode, wpm, cpm, accuracy, errors, key_heatmap, replay_data]
        const row = {
            id: mockDb.typing_results.length + 1,
            user_id: params[0],
            mode: params[1],
            wpm: params[2],
            cpm: params[3],
            accuracy: params[4],
            errors: JSON.parse(params[5] || '{}'),
            key_heatmap: JSON.parse(params[6] || '{}'),
            replay_data: JSON.parse(params[7] || '[]'),
            created_at: new Date()
        };
        mockDb.typing_results.push(row);
        return { rows: [row] };
    }

    // Typing Results fetching
    if (sqlLower.includes('from typing_results') && sqlLower.includes('user_id = $1')) {
        const userId = parseInt(params[0]);
        const filtered = mockDb.typing_results.filter(r => r.user_id === userId);
        // Sort descending by created_at
        filtered.sort((a, b) => b.created_at - a.created_at);
        return { rows: filtered };
    }

    // Leaderboard querying
    if (sqlLower.includes('join profiles') && sqlLower.includes('order by xp desc')) {
        const rows = mockDb.users.map(u => {
            const p = mockDb.profiles[u.id];
            return {
                id: u.id,
                username: u.username,
                display_name: p.display_name,
                avatar: p.avatar,
                xp: p.xp,
                highest_wpm: p.highest_wpm,
                typing_level: p.typing_level,
                country: p.country,
                games_played: p.games_played
            };
        }).sort((a, b) => b.xp - a.xp).slice(0, 100);
        return { rows };
    }

    if (sqlLower.includes('join profiles') && sqlLower.includes('order by highest_wpm desc')) {
        const rows = mockDb.users.map(u => {
            const p = mockDb.profiles[u.id];
            return {
                id: u.id,
                username: u.username,
                display_name: p.display_name,
                avatar: p.avatar,
                xp: p.xp,
                highest_wpm: p.highest_wpm,
                typing_level: p.typing_level,
                country: p.country,
                games_played: p.games_played
            };
        }).sort((a, b) => b.highest_wpm - a.highest_wpm).slice(0, 100);
        return { rows };
    }

    // Missions query
    if (sqlLower.includes('from missions')) {
        return { rows: mockDb.missions };
    }

    // User missions query
    if (sqlLower.includes('from user_missions') && sqlLower.includes('user_id = $1')) {
        const userId = parseInt(params[0]);
        const list = mockDb.user_missions[userId] || [];
        const rows = list.map(um => {
            const m = mockDb.missions.find(mi => mi.id === um.mission_id);
            return { ...m, ...um };
        });
        return { rows };
    }

    // Update user mission
    if (sqlLower.startsWith('update user_missions')) {
        const userId = parseInt(params[2]);
        const missionId = params[3];
        const list = mockDb.user_missions[userId] || [];
        const um = list.find(item => item.mission_id === missionId);
        if (um) {
            um.progress = params[0];
            um.completed = params[1];
            um.updated_at = new Date();
        }
        return { rows: [um] };
    }

    // Friends list query
    if (sqlLower.includes('from friends') && sqlLower.includes('user_id1 = $1')) {
        const userId = parseInt(params[0]);
        const list = mockDb.friends.filter(f => (f.user_id1 === userId || f.user_id2 === userId) && f.status === 'accepted');
        const rows = list.map(f => {
            const friendId = f.user_id1 === userId ? f.user_id2 : f.user_id1;
            const u = mockDb.users.find(us => us.id === friendId);
            const p = mockDb.profiles[friendId];
            return {
                id: friendId,
                username: u ? u.username : 'Unknown',
                display_name: p ? p.display_name : 'Unknown',
                avatar: p ? p.avatar : 'default',
                typing_level: p ? p.typing_level : 1,
                highest_wpm: p ? p.highest_wpm : 0,
                last_active: p ? p.last_active : new Date()
            };
        });
        return { rows };
    }

    // Chat queries
    if (sqlLower.startsWith('select') && sqlLower.includes('chats') && sqlLower.includes('sender_id = $1')) {
        const senderId = parseInt(params[0]);
        const receiverId = parseInt(params[1]);
        const filtered = mockDb.chats.filter(c => 
            (c.sender_id === senderId && c.receiver_id === receiverId) ||
            (c.sender_id === receiverId && c.receiver_id === senderId)
        );
        filtered.sort((a, b) => a.created_at - b.created_at);
        return { rows: filtered };
    }

    if (sqlLower.startsWith('insert into chats')) {
        const msg = {
            id: mockDb.chats.length + 1,
            sender_id: params[0],
            receiver_id: params[1],
            message: params[2],
            created_at: new Date()
        };
        mockDb.chats.push(msg);
        return { rows: [msg] };
    }

    // General default fallback
    return { rows: [] };
}

module.exports = {
    query,
    getPool: () => pool,
    isMock: () => isMockDatabase
};
