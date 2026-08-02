const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

// Apply admin access check middleware to all routes in this file
router.use(authenticateToken);
router.use(authorizeAdmin);

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get dashboard metrics for admin statistics panel
 */
router.get('/dashboard', async (req, res, next) => {
    try {
        const totalUsers = await db.query('SELECT COUNT(*) as count FROM users');
        const totalGames = await db.query('SELECT COUNT(*) as count FROM typing_results');
        
        const avgSpeedRes = await db.query('SELECT AVG(wpm) as avg_wpm, AVG(accuracy) as avg_acc FROM typing_results');
        
        // Count registrations in the last 7 days
        const recentUsers = await db.query(
            "SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"
        );

        // Get most typed mode
        const topModes = await db.query(
            "SELECT mode, COUNT(*) as count FROM typing_results GROUP BY mode ORDER BY count DESC LIMIT 3"
        );

        res.status(200).json({
            metrics: {
                total_users: parseInt(totalUsers.rows[0].count || 0),
                total_games_played: parseInt(totalGames.rows[0].count || 0),
                average_wpm: parseFloat(avgSpeedRes.rows[0].avg_wpm || 0).toFixed(1),
                average_accuracy: parseFloat(avgSpeedRes.rows[0].avg_acc || 0).toFixed(2),
                registrations_7d: parseInt(recentUsers.rows[0].count || 0)
            },
            popular_modes: topModes.rows
        });

    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get complete list of users with level and stats
 */
router.get('/users', async (req, res, next) => {
    try {
        const usersRes = await db.query(
            `SELECT u.id, u.username, u.email, u.role, u.created_at,
                    p.display_name, p.xp, p.typing_level, p.highest_wpm, p.games_played
             FROM users u
             JOIN profiles p ON u.id = p.user_id
             ORDER BY u.id ASC`
        );
        res.status(200).json({ users: usersRes.rows });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/admin/quotes
 * @desc    Add a new quote to the practice library
 */
router.post('/quotes', async (req, res, next) => {
    try {
        const { text, author, difficulty } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Quote text is required.' });
        }

        const quoteRes = await db.query(
            'INSERT INTO quotes (text, author, difficulty) VALUES ($1, $2, $3) RETURNING *',
            [text.trim(), author ? author.trim() : 'Unknown', difficulty || 'medium']
        );

        res.status(201).json({ message: 'Quote added successfully.', quote: quoteRes.rows[0] });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/admin/code
 * @desc    Add a programming snippet
 */
router.post('/code', async (req, res, next) => {
    try {
        const { language, code, title, difficulty } = req.body;

        if (!language || !code || code.trim().length === 0) {
            return res.status(400).json({ error: 'Language and code block are required.' });
        }

        const snippetRes = await db.query(
            'INSERT INTO programming_texts (language, code, title, difficulty) VALUES ($1, $2, $3, $4) RETURNING *',
            [language.toLowerCase().trim(), code, title ? title.trim() : 'Snippet', difficulty || 'medium']
        );

        res.status(201).json({ message: 'Code snippet added successfully.', snippet: snippetRes.rows[0] });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete a user account
 */
router.delete('/users/:id', async (req, res, next) => {
    try {
        const targetId = parseInt(req.params.id);

        if (targetId === req.user.id) {
            return res.status(400).json({ error: 'You cannot delete your own admin account.' });
        }

        await db.query('DELETE FROM users WHERE id = $1', [targetId]);
        res.status(200).json({ message: 'User deleted successfully.' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
