-- TypeSprint PostgreSQL Database Schema

-- Drop tables if they exist (for easy resetting/migration)
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS shop_items CASCADE;
DROP TABLE IF EXISTS user_missions CASCADE;
DROP TABLE IF EXISTS missions CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS friend_requests CASCADE;
DROP TABLE IF EXISTS friends CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS typing_results CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS programming_texts CASCADE;

-- 1. Users table (Core authentication details)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- 'user', 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Profiles table (Game progress, XP, coins, customizations)
CREATE TABLE profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Global',
    bio TEXT DEFAULT '',
    avatar VARCHAR(255) DEFAULT 'default',
    typing_level INT DEFAULT 1,
    xp INT DEFAULT 0,
    coins INT DEFAULT 0,
    highest_wpm INT DEFAULT 0,
    highest_accuracy NUMERIC(5,2) DEFAULT 0.00,
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    games_played INT DEFAULT 0,
    games_won INT DEFAULT 0,
    typing_seconds INT DEFAULT 0,
    equipped_theme VARCHAR(50) DEFAULT 'glass-dark',
    equipped_cursor VARCHAR(50) DEFAULT 'line-blink',
    equipped_skin VARCHAR(50) DEFAULT 'default',
    equipped_badge VARCHAR(50) DEFAULT 'novice',
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for leaderboard queries
CREATE INDEX idx_profiles_xp ON profiles(xp DESC);
CREATE INDEX idx_profiles_highest_wpm ON profiles(highest_wpm DESC);

-- 3. Typing Results (Practice and Race history logs)
CREATE TABLE typing_results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(50) NOT NULL, -- 'timed', 'quote', 'code', 'custom', 'race'
    wpm INT NOT NULL,
    cpm INT NOT NULL,
    accuracy NUMERIC(5,2) NOT NULL,
    errors JSONB DEFAULT '{}', -- format: {"a": 3, "s": 1}
    key_heatmap JSONB DEFAULT '{}', -- format: {"a": {"total": 20, "error": 3}}
    replay_data JSONB DEFAULT '[]', -- format: [{"time": 120, "key": "a", "status": true}]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_results_user ON typing_results(user_id);
CREATE INDEX idx_results_created ON typing_results(created_at DESC);

-- 4. Achievements System
CREATE TABLE achievements (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    reward_coins INT DEFAULT 100,
    reward_xp INT DEFAULT 150,
    icon VARCHAR(100) DEFAULT 'trophy'
);

-- 5. User Achievements mapping
CREATE TABLE user_achievements (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id)
);

-- 6. Friends System
CREATE TABLE friends (
    user_id1 INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_id2 INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'accepted', -- 'accepted', 'blocked'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id1, user_id2),
    CHECK (user_id1 < user_id2) -- ensures unique pairs
);

-- 7. Friend Requests
CREATE TABLE friend_requests (
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sender_id, receiver_id),
    CHECK (sender_id != receiver_id)
);

-- 8. Real-time direct chat logs
CREATE TABLE chats (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chats_sender_receiver ON chats(sender_id, receiver_id);

-- 9. Quotes library for practice modes
CREATE TABLE quotes (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    author VARCHAR(100) DEFAULT 'Unknown',
    difficulty VARCHAR(20) DEFAULT 'medium' -- 'easy', 'medium', 'hard'
);

-- 10. Programming texts (code snippets)
CREATE TABLE programming_texts (
    id SERIAL PRIMARY KEY,
    language VARCHAR(50) NOT NULL, -- 'javascript', 'python', 'java', 'cpp', 'html', 'css', 'sql'
    code TEXT NOT NULL,
    title VARCHAR(100) DEFAULT 'Code Snippet',
    difficulty VARCHAR(20) DEFAULT 'medium'
);

-- 11. Missions system (Daily / Weekly goals)
CREATE TABLE missions (
    id VARCHAR(50) PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- 'daily', 'weekly'
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    target_value INT NOT NULL,
    target_type VARCHAR(50) NOT NULL, -- 'games', 'wpm', 'seconds', 'accuracy'
    reward_coins INT DEFAULT 50,
    reward_xp INT DEFAULT 100
);

-- 12. User Missions progress tracking
CREATE TABLE user_missions (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    mission_id VARCHAR(50) REFERENCES missions(id) ON DELETE CASCADE,
    progress INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, mission_id)
);

-- 13. Customize Shop Items
CREATE TABLE shop_items (
    id VARCHAR(50) PRIMARY KEY,
    category VARCHAR(50) NOT NULL, -- 'theme', 'cursor', 'badge', 'skin'
    name VARCHAR(100) NOT NULL,
    price INT NOT NULL,
    value VARCHAR(100) NOT NULL, -- CSS class / styling config
    preview_color VARCHAR(50) DEFAULT ''
);

-- 14. Shop Purchases
CREATE TABLE purchases (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(50) REFERENCES shop_items(id) ON DELETE CASCADE,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_id)
);


-- ========================================================
-- SEED DATA
-- ========================================================

-- Seeding Shop Customizations
INSERT INTO shop_items (id, category, name, price, value, preview_color) VALUES
-- Themes
('theme-neon', 'theme', 'Neon Cyberpunk', 300, 'neon-cyberpunk', '#ff0055'),
('theme-sakura', 'theme', 'Sakura Blossom', 250, 'sakura-blossom', '#ffb3c6'),
('theme-carbon', 'theme', 'Carbon Dark', 150, 'carbon-dark', '#2a2d34'),
('theme-forest', 'theme', 'Mossy Forest', 200, 'mossy-forest', '#31572c'),
('theme-sunset', 'theme', 'Sunset Glow', 250, 'sunset-glow', '#f77f00'),
('theme-glass-light', 'theme', 'Glass Light', 100, 'glass-light', '#e0e1dd'),
-- Cursors
('cursor-block', 'cursor', 'Block Cursor', 100, 'block-solid', '#ffffff'),
('cursor-pulse', 'cursor', 'Pulsing Line', 150, 'line-pulse', '#ff0055'),
('cursor-underline', 'cursor', 'Underline', 100, 'cursor-underline', '#00ffcc'),
-- Badges
('badge-speed-demon', 'badge', 'Speed Demon', 500, 'speed-demon', '⚡'),
('badge-perfectionist', 'badge', 'Perfectionist', 500, 'perfectionist', '🎯'),
('badge-legend', 'badge', 'Typing Legend', 1000, 'typing-legend', '👑'),
('badge-hacker', 'badge', 'Terminal Hacker', 400, 'terminal-hacker', '💻');

-- Seeding Standard Achievements
INSERT INTO achievements (id, title, description, reward_coins, reward_xp, icon) VALUES
('first-game', 'First Steps', 'Complete your very first typing practice session.', 50, 100, 'runner'),
('wpm-80', 'Speedy Typer', 'Reach 80 Words Per Minute (WPM) in any practice mode.', 100, 150, 'speed'),
('wpm-100', 'Centurion Speed', 'Reach 100 Words Per Minute (WPM) in any practice mode.', 200, 300, 'bolt'),
('wpm-120', 'Keyboard Warrior', 'Reach 120 Words Per Minute (WPM) in any practice mode.', 400, 500, 'fire'),
('wpm-150', 'Sonic Fingertips', 'Reach 150 Words Per Minute (WPM) in any practice mode.', 1000, 1000, 'rocket'),
('accuracy-100', 'Perfect Flow', 'Complete a session with 100% typing accuracy.', 300, 400, 'bullseye'),
('no-mistakes', 'No Room for Error', 'Complete a text of at least 150 characters without a single backspace or error.', 500, 600, 'shield'),
('streak-7', 'Dedicated Typer', 'Maintain a 7-day typing practice streak.', 400, 500, 'calendar'),
('streak-30', 'Consistent Mastery', 'Maintain a 30-day typing practice streak.', 1500, 2000, 'trophy'),
('games-100', 'Keyboard Veteran', 'Play a total of 100 typing matches or practices.', 500, 600, 'award'),
('rich-typer', 'Coin Hoarder', 'Accumulate a balance of 1000 typing coins.', 200, 300, 'wallet');

-- Seeding Missions
INSERT INTO missions (id, type, title, description, target_value, target_type, reward_coins, reward_xp) VALUES
('daily-3-games', 'daily', 'Daily Routine', 'Complete 3 typing practice sessions today.', 3, 'games', 50, 100),
('daily-wpm-60', 'daily', 'Pushing Limits', 'Reach 60 WPM in any typing mode.', 60, 'wpm', 40, 80),
('daily-time-300', 'daily', 'Dedication', 'Spend a total of 5 minutes typing in practices.', 300, 'seconds', 60, 120),
('weekly-20-games', 'weekly', 'Weekly Grind', 'Complete 20 typing sessions this week.', 20, 'games', 300, 500),
('weekly-accuracy-98', 'weekly', 'Sniper Fingertips', 'Complete a test with at least 98% accuracy.', 98, 'accuracy', 200, 400);

-- Seeding Quotes
INSERT INTO quotes (text, author, difficulty) VALUES
('The quick brown fox jumps over the lazy dog.', 'English Pangram', 'easy'),
('To be or not to be, that is the question.', 'William Shakespeare', 'easy'),
('Success is not final, failure is not fatal: it is the courage to continue that counts.', 'Winston Churchill', 'medium'),
('In the middle of difficulty lies opportunity.', 'Albert Einstein', 'medium'),
('Computers are useless. They can only give you answers.', 'Pablo Picasso', 'medium'),
('The best way to predict the future is to invent it.', 'Alan Kay', 'medium'),
('Do not go where the path may lead, go instead where there is no path and leave a trail.', 'Ralph Waldo Emerson', 'medium'),
('I have not failed. I have just found ten thousand ways that won''t work.', 'Thomas A. Edison', 'medium'),
('If you want to live a happy life, tie it to a goal, not to people or things.', 'Albert Einstein', 'hard'),
('You miss one hundred percent of the shots you don''t take.', 'Wayne Gretzky', 'easy'),
('Ask not what your country can do for you; ask what you can do for your country.', 'John F. Kennedy', 'medium'),
('The only limit to our realization of tomorrow will be our doubts of today.', 'Franklin D. Roosevelt', 'hard'),
('It is during our darkest moments that we must focus to see the light.', 'Aristotle Onassis', 'medium'),
('Twenty years from now you will be more disappointed by the things that you didn''t do than by the ones you did do.', 'Mark Twain', 'hard'),
('Design is not just what it looks like and feels like. Design is how it works.', 'Steve Jobs', 'hard');

-- Seeding Programming snippets
INSERT INTO programming_texts (language, code, title, difficulty) VALUES
('javascript', 'const express = require(''express'');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get(''/api/health'', (req, res) => {
    res.status(200).json({ status: ''UP'' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});', 'Express Setup', 'medium'),

('python', 'def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)

print(quick_sort([3,6,8,10,1,2,1]))', 'Quick Sort', 'hard'),

('html', '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>TypeSprint Premium</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <main id="app-container">
        <h1>Welcome to TypeSprint</h1>
        <button id="btn-start">Race Now</button>
    </main>
</body>
</html>', 'HTML Page Boilerplate', 'easy'),

('css', '.glass-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}', 'Glassmorphism Style', 'easy'),

('sql', 'SELECT u.username, p.highest_wpm, p.typing_level,
       RANK() OVER (ORDER BY p.highest_wpm DESC) as rank_position
FROM users u
JOIN profiles p ON u.id = p.user_id
WHERE p.games_played >= 10
LIMIT 100;', 'Leaderboard Rank Query', 'medium'),

('java', 'public class Fibonacci {
    public static int fib(int n) {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
    }
    public static void main(String[] args) {
        System.out.println("Fibonacci 10: " + fib(10));
    }
}', 'Fibonacci Java', 'medium'),

('cpp', '#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::vector<int> nums = {1, 2, 3, 4, 5};
    int sum = std::accumulate(nums.begin(), nums.end(), 0);
    std::cout << "Sum: " << sum << std::endl;
    return 0;
}', 'C++ Vector Accumulation', 'hard');
