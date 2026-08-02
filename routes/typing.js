const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// A basic dictionary list for Random Words Mode
const GENERAL_WORDS = [
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with",
    "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
    "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if",
    "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no", "just", "him",
    "know", "take", "people", "into", "year", "your", "good", "some", "could", "them", "see", "other", "than",
    "then", "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use", "two",
    "how", "our", "work", "first", "well", "way", "even", "new", "want", "because", "any", "these", "give",
    "day", "most", "us", "keyboard", "practice", "accuracy", "speed", "words", "minute", "champion", "sprint"
];

/**
 * @route   GET /api/typing/text
 * @desc    Get typing text practice target based on mode
 */
router.get('/text', async (req, res, next) => {
    try {
        const { mode, difficulty, language, wordCount } = req.query;

        if (mode === 'quote') {
            const diff = difficulty || 'medium';
            const quotesRes = await db.query(
                'SELECT text, author FROM quotes WHERE difficulty = $1',
                [diff]
            );
            
            if (quotesRes.rows.length === 0) {
                // Return fallback if database has no rows
                return res.status(200).json({
                    text: "The quick brown fox jumps over the lazy dog.",
                    author: "English Pangram"
                });
            }
            
            // Return a random quote
            const randIndex = Math.floor(Math.random() * quotesRes.rows.length);
            return res.status(200).json(quotesRes.rows[randIndex]);
        }

        if (mode === 'code') {
            const lang = language || 'javascript';
            const codeRes = await db.query(
                'SELECT code, title, language FROM programming_texts WHERE language = $1',
                [lang]
            );

            if (codeRes.rows.length === 0) {
                return res.status(200).json({
                    code: "console.log('Hello, TypeSprint!');",
                    title: "Hello World",
                    language: "javascript"
                });
            }

            const randIndex = Math.floor(Math.random() * codeRes.rows.length);
            return res.status(200).json(codeRes.rows[randIndex]);
        }

        if (mode === 'words') {
            const limit = parseInt(wordCount || '25');
            const shuffled = [...GENERAL_WORDS].sort(() => 0.5 - Math.random());
            const text = shuffled.slice(0, Math.min(limit, shuffled.length)).join(' ');
            return res.status(200).json({ text, author: 'TypeSprint Generator' });
        }

        // Default standard prompt
        res.status(200).json({
            text: "This is a standard typing test on TypeSprint. Practice makes perfect, so type as fast and accurately as possible.",
            author: "TypeSprint Team"
        });

    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/typing/results
 * @desc    Submit typing result, calculate rewards, advance missions, and unlock achievements
 */
router.post('/results', authenticateToken, async (req, res, next) => {
    try {
        const { mode, wpm, cpm, accuracy, errors, keyHeatmap, replayData, typingSeconds } = req.body;

        if (wpm === undefined || accuracy === undefined) {
            return res.status(400).json({ error: 'Please provide WPM and accuracy details.' });
        }

        const userId = req.user.id;
        const finalWpm = parseInt(wpm);
        const finalAcc = parseFloat(accuracy);
        const secs = parseInt(typingSeconds || '30');

        // 1. Save results to database
        const resultRes = await db.query(
            `INSERT INTO typing_results (user_id, mode, wpm, cpm, accuracy, errors, key_heatmap, replay_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, created_at`,
            [
                userId,
                mode || 'practice',
                finalWpm,
                parseInt(cpm || (finalWpm * 5)),
                finalAcc,
                JSON.stringify(errors || {}),
                JSON.stringify(keyHeatmap || {}),
                JSON.stringify(replayData || [])
            ]
        );

        // 2. Fetch current profile statistics
        const profileRes = await db.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
        if (profileRes.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found.' });
        }
        
        const profile = profileRes.rows[0];

        // 3. Calculate rewards (XP & Coins)
        // Base Coins = WPM * (Acc / 100) * 0.2 + 5
        // Base XP = WPM * (Acc / 100) + 10
        // Perfect accuracy multiplier = 1.5x
        const accFactor = finalAcc / 100.0;
        let earnedXp = Math.floor(finalWpm * accFactor + 10);
        let earnedCoins = Math.floor(finalWpm * accFactor * 0.2 + 5);

        if (finalAcc === 100.0) {
            earnedXp = Math.floor(earnedXp * 1.5);
            earnedCoins = Math.floor(earnedCoins * 2.0);
        }

        const newXp = profile.xp + earnedXp;
        const newCoins = profile.coins + earnedCoins;

        // Peak score trackers
        const peakWpm = Math.max(profile.highest_wpm, finalWpm);
        const peakAcc = Math.max(parseFloat(profile.highest_accuracy), finalAcc);
        const totalGames = profile.games_played + 1;
        const totalSeconds = profile.typing_seconds + secs;

        // Check and update streaks (simple day-offset calculations)
        // In local mock mode, we just increment or maintain streak
        let currentStreak = profile.current_streak;
        let longestStreak = profile.longest_streak;
        const lastActiveDate = new Date(profile.last_active);
        const today = new Date();
        const diffTime = Math.abs(today - lastActiveDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
            // Keep streak or increment if it's a new day
            if (today.getDate() !== lastActiveDate.getDate() && diffDays <= 1) {
                currentStreak += 1;
            } else if (currentStreak === 0) {
                currentStreak = 1;
            }
        } else {
            // Streak broken
            currentStreak = 1;
        }
        longestStreak = Math.max(longestStreak, currentStreak);

        // Update database Profile
        await db.query(
            `UPDATE profiles
             SET xp = $1, coins = $2, highest_wpm = $3, highest_accuracy = $4,
                 games_played = $5, typing_seconds = $6, current_streak = $7,
                 longest_streak = $8, last_active = CURRENT_TIMESTAMP
             WHERE user_id = $9`,
            [newXp, newCoins, peakWpm, peakAcc, totalGames, totalSeconds, currentStreak, longestStreak, userId]
        );

        // 4. Update Daily & Weekly Missions
        const missionsRes = await db.query(
            'SELECT um.*, m.target_value, m.target_type, m.reward_coins, m.reward_xp FROM user_missions um JOIN missions m ON um.mission_id = m.id WHERE um.user_id = $1 AND um.completed = false',
            [userId]
        );

        let extraCoins = 0;
        let extraXp = 0;
        const completedMissionTitles = [];

        for (const userMission of missionsRes.rows) {
            let progressInc = 0;
            if (userMission.target_type === 'games') {
                progressInc = 1;
            } else if (userMission.target_type === 'wpm' && finalWpm >= userMission.target_value) {
                // Complete mission instantly if threshold passed
                progressInc = userMission.target_value - userMission.progress;
            } else if (userMission.target_type === 'seconds') {
                progressInc = secs;
            } else if (userMission.target_type === 'accuracy' && finalAcc >= userMission.target_value) {
                progressInc = userMission.target_value - userMission.progress;
            }

            if (progressInc > 0) {
                const newProgress = Math.min(userMission.target_value, userMission.progress + progressInc);
                const isCompleted = newProgress >= userMission.target_value;

                await db.query(
                    'UPDATE user_missions SET progress = $1, completed = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $3 AND mission_id = $4',
                    [newProgress, isCompleted, userId, userMission.mission_id]
                );

                if (isCompleted) {
                    extraCoins += userMission.reward_coins;
                    extraXp += userMission.reward_xp;
                    completedMissionTitles.push(userMission.title);
                }
            }
        }

        // Apply mission rewards if any completed
        if (extraCoins > 0 || extraXp > 0) {
            await db.query(
                'UPDATE profiles SET coins = coins + $1, xp = xp + $2 WHERE user_id = $3',
                [extraCoins, extraXp, userId]
            );
        }

        // 5. Unlock Achievements check
        const unlockedAchievements = [];
        
        // Fetch already unlocked achievements to prevent duplicates
        const unlockedResult = await db.query('SELECT achievement_id FROM user_achievements WHERE user_id = $1', [userId]);
        const ownedAchIds = unlockedResult.rows.map(r => r.achievement_id);

        const checkUnlock = async (id, condition) => {
            if (!ownedAchIds.includes(id) && condition) {
                await db.query(
                    'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)',
                    [userId, id]
                );
                // Fetch details for response
                const achDetail = await db.query('SELECT title, reward_coins, reward_xp FROM achievements WHERE id = $1', [id]);
                if (achDetail.rows.length > 0) {
                    const d = achDetail.rows[0];
                    unlockedAchievements.push({ id, title: d.title, reward_coins: d.reward_coins, reward_xp: d.reward_xp });
                    // Award achievement prize
                    await db.query(
                        'UPDATE profiles SET coins = coins + $1, xp = xp + $2 WHERE user_id = $3',
                        [d.reward_coins, d.reward_xp, userId]
                    );
                }
            }
        };

        const totalErrors = Object.values(errors || {}).reduce((acc, curr) => acc + curr, 0);

        await checkUnlock('first-game', true);
        await checkUnlock('wpm-80', finalWpm >= 80);
        await checkUnlock('wpm-100', finalWpm >= 100);
        await checkUnlock('wpm-120', finalWpm >= 120);
        await checkUnlock('wpm-150', finalWpm >= 150);
        await checkUnlock('accuracy-100', finalAcc === 100.0);
        await checkUnlock('no-mistakes', totalErrors === 0 && finalWpm >= 40); // at least a baseline speed to count
        await checkUnlock('streak-7', currentStreak >= 7);
        await checkUnlock('games-100', totalGames >= 100);
        await checkUnlock('rich-typer', (newCoins + extraCoins) >= 1000);

        res.status(200).json({
            message: 'Typing results submitted successfully.',
            runId: resultRes.rows[0].id,
            rewards: {
                xp: earnedXp + extraXp,
                coins: earnedCoins + extraCoins,
                breakdown: {
                    base_xp: earnedXp,
                    base_coins: earnedCoins,
                    mission_xp: extraXp,
                    mission_coins: extraCoins
                }
            },
            streaks: {
                current: currentStreak,
                longest: longestStreak
            },
            completed_missions: completedMissionTitles,
            unlocked_achievements: unlockedAchievements
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
