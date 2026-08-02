const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * Helper to calculate level based on XP
 * XP formula: Level = floor(sqrt(xp / 100)) + 1
 */
function getLevel(xp) {
    if (xp <= 0) return 1;
    return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Helper to calculate XP needed for the next level
 */
function getXpForNextLevel(currentLevel) {
    return Math.pow(currentLevel, 2) * 100;
}

/**
 * @route   GET /api/profile
 * @desc    Get authenticated user's complete profile
 */
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const profileResult = await db.query(
            `SELECT u.username, u.email, u.role, p.*
             FROM users u
             JOIN profiles p ON u.id = p.user_id
             WHERE u.id = $1`,
            [req.user.id]
        );

        if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        const profile = profileResult.rows[0];
        
        // Dynamic level adjustment
        const correctLevel = getLevel(profile.xp);
        if (correctLevel !== profile.typing_level) {
            profile.typing_level = correctLevel;
            await db.query('UPDATE profiles SET typing_level = $1 WHERE user_id = $2', [correctLevel, req.user.id]);
        }

        // Fetch user achievements
        const achResult = await db.query(
            `SELECT a.*, ua.unlocked_at
             FROM achievements a
             JOIN user_achievements ua ON a.id = ua.achievement_id
             WHERE ua.user_id = $1`,
            [req.user.id]
        );

        // Fetch equipped customizations
        res.status(200).json({
            profile: {
                ...profile,
                xp_for_next_level: getXpForNextLevel(profile.typing_level)
            },
            achievements: achResult.rows
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/profile/:username
 * @desc    Get public profile of another user
 */
router.get('/public/:username', async (req, res, next) => {
    try {
        const username = req.params.username.trim();
        
        const userResult = await db.query(
            `SELECT u.id, u.username, p.display_name, p.country, p.bio, p.avatar, p.typing_level,
                    p.xp, p.highest_wpm, p.highest_accuracy, p.games_played, p.games_won,
                    p.typing_seconds, p.equipped_theme, p.equipped_badge, p.created_at, p.last_active
             FROM users u
             JOIN profiles p ON u.id = p.user_id
             WHERE u.username = $1`,
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User profile not found.' });
        }

        const publicProfile = userResult.rows[0];

        // Fetch public achievements
        const achResult = await db.query(
            `SELECT a.title, a.description, a.icon, ua.unlocked_at
             FROM achievements a
             JOIN user_achievements ua ON a.id = ua.achievement_id
             WHERE ua.user_id = $1`,
            [publicProfile.id]
        );

        res.status(200).json({
            profile: publicProfile,
            achievements: achResult.rows
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/profile/update
 * @desc    Update profile details
 */
router.put('/update', authenticateToken, async (req, res, next) => {
    try {
        const { displayName, country, bio, avatar } = req.body;
        
        const currentProfile = await db.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
        if (currentProfile.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        const profile = currentProfile.rows[0];
        const newDisplayName = displayName !== undefined ? displayName.trim() : profile.display_name;
        const newCountry = country !== undefined ? country.trim() : profile.country;
        const newBio = bio !== undefined ? bio.trim() : profile.bio;
        const newAvatar = avatar !== undefined ? avatar.trim() : profile.avatar;

        if (newDisplayName && newDisplayName.length > 50) {
            return res.status(400).json({ error: 'Display Name cannot exceed 50 characters.' });
        }

        const updatedResult = await db.query(
            `UPDATE profiles 
             SET display_name = $1, country = $2, bio = $3, avatar = $4 
             WHERE user_id = $5 
             RETURNING *`,
            [newDisplayName, newCountry, newBio, newAvatar, req.user.id]
        );

        res.status(200).json({
            message: 'Profile updated successfully.',
            profile: updatedResult.rows[0]
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/profile/stats
 * @desc    Get detailed typing performance statistics over time (charts, history, WPM trends)
 */
router.get('/stats', authenticateToken, async (req, res, next) => {
    try {
        // Fetch recent results (last 100 runs)
        const results = await db.query(
            `SELECT id, mode, wpm, cpm, accuracy, errors, created_at
             FROM typing_results
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 100`,
            [req.user.id]
        );

        // Fetch aggregate user stats
        const profileResult = await db.query(
            `SELECT highest_wpm, highest_accuracy, games_played, games_won, typing_seconds, current_streak, longest_streak
             FROM profiles
             WHERE user_id = $1`,
            [req.user.id]
        );

        const stats = profileResult.rows[0];
        const rows = results.rows;

        // Calculate average WPM & accuracy of the last 10 games
        const last10 = rows.slice(0, 10);
        const avgWpmLast10 = last10.length > 0 ? (last10.reduce((acc, curr) => acc + curr.wpm, 0) / last10.length).toFixed(1) : 0;
        const avgAccLast10 = last10.length > 0 ? (last10.reduce((acc, curr) => acc + parseFloat(curr.accuracy), 0) / last10.length).toFixed(2) : 0;

        // Calculate common mistakes (aggregate wrong character matrices)
        const errorAggMap = {};
        rows.forEach(r => {
            const errs = typeof r.errors === 'string' ? JSON.parse(r.errors) : r.errors;
            if (errs) {
                Object.keys(errs).forEach(char => {
                    errorAggMap[char] = (errorAggMap[char] || 0) + errs[char];
                });
            }
        });

        // Get top 5 mistake characters
        const sortedMistakes = Object.entries(errorAggMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([char, count]) => ({ char, count }));

        res.status(200).json({
            aggregate: {
                ...stats,
                avg_wpm_recent: parseFloat(avgWpmLast10),
                avg_accuracy_recent: parseFloat(avgAccLast10)
            },
            history: rows,
            common_mistakes: sortedMistakes
        });

    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/profile/heatmap
 * @desc    Get keyboard typing heatmap aggregates for keys pressed/missed
 */
router.get('/heatmap', authenticateToken, async (req, res, next) => {
    try {
        const results = await db.query(
            `SELECT key_heatmap FROM typing_results
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.user.id]
        );

        const mergedHeatmap = {};

        results.rows.forEach(row => {
            const map = typeof row.key_heatmap === 'string' ? JSON.parse(row.key_heatmap) : row.key_heatmap;
            if (map) {
                Object.keys(map).forEach(key => {
                    if (!mergedHeatmap[key]) {
                        mergedHeatmap[key] = { total: 0, error: 0 };
                    }
                    mergedHeatmap[key].total += map[key].total || 0;
                    mergedHeatmap[key].error += map[key].error || 0;
                });
            }
        });

        res.status(200).json({ heatmap: mergedHeatmap });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/profile/equip
 * @desc    Equip purchased visual skin configurations
 */
router.put('/equip', authenticateToken, async (req, res, next) => {
    try {
        const { category, itemId } = req.body; // category = 'theme' | 'cursor' | 'badge' | 'skin'

        if (!category || !itemId) {
            return res.status(400).json({ error: 'Please specify items category and item ID.' });
        }

        // Verify user owns the shop item (or that it is a default item)
        // Default items do not require purchases
        const isDefault = itemId.includes('glass-dark') || itemId.includes('line-blink') || itemId.includes('novice') || itemId.includes('default');
        
        if (!isDefault) {
            const purchaseCheck = await db.query(
                'SELECT 1 FROM purchases WHERE user_id = $1 AND item_id = $2',
                [req.user.id, itemId]
            );

            if (purchaseCheck.rows.length === 0) {
                return res.status(403).json({ error: 'You do not own this customization item.' });
            }
        }

        // Fetch item details
        const itemResult = await db.query('SELECT value FROM shop_items WHERE id = $1', [itemId]);
        const equippedValue = itemResult.rows.length > 0 ? itemResult.rows[0].value : itemId;

        let queryText = '';
        if (category === 'theme') {
            queryText = 'UPDATE profiles SET equipped_theme = $1 WHERE user_id = $2 RETURNING equipped_theme';
        } else if (category === 'cursor') {
            queryText = 'UPDATE profiles SET equipped_cursor = $1 WHERE user_id = $2 RETURNING equipped_cursor';
        } else if (category === 'badge') {
            queryText = 'UPDATE profiles SET equipped_badge = $1 WHERE user_id = $2 RETURNING equipped_badge';
        } else if (category === 'skin') {
            queryText = 'UPDATE profiles SET equipped_skin = $1 WHERE user_id = $2 RETURNING equipped_skin';
        } else {
            return res.status(400).json({ error: 'Invalid customization category.' });
        }

        const updateRes = await db.query(queryText, [equippedValue, req.user.id]);

        res.status(200).json({
            message: `Equipped ${category} successfully.`,
            equipped: updateRes.rows[0]
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
