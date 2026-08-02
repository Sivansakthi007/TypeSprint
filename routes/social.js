const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route   GET /api/social/friends
 * @desc    Get accepted friends list with active level & last_active info
 */
router.get('/friends', authenticateToken, async (req, res, next) => {
    try {
        const friendsRes = await db.query(
            `SELECT p.user_id as id, u.username, p.display_name, p.avatar, p.typing_level, p.highest_wpm, p.last_active
             FROM friends f
             JOIN users u ON (f.user_id1 = u.id OR f.user_id2 = u.id)
             JOIN profiles p ON u.id = p.user_id
             WHERE (f.user_id1 = $1 OR f.user_id2 = $1) AND u.id != $1 AND f.status = 'accepted'`,
            [req.user.id]
        );
        res.status(200).json({ friends: friendsRes.rows });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/social/requests
 * @desc    Get pending received/sent friend requests
 */
router.get('/requests', authenticateToken, async (req, res, next) => {
    try {
        const received = await db.query(
            `SELECT fr.sender_id as id, u.username, p.display_name, p.avatar
             FROM friend_requests fr
             JOIN users u ON fr.sender_id = u.id
             JOIN profiles p ON u.id = p.user_id
             WHERE fr.receiver_id = $1 AND fr.status = 'pending'`,
            [req.user.id]
        );

        const sent = await db.query(
            `SELECT fr.receiver_id as id, u.username, p.display_name, p.avatar
             FROM friend_requests fr
             JOIN users u ON fr.receiver_id = u.id
             JOIN profiles p ON u.id = p.user_id
             WHERE fr.sender_id = $1 AND fr.status = 'pending'`,
            [req.user.id]
        );

        res.status(200).json({ received: received.rows, sent: sent.rows });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/social/search
 * @desc    Search for users to add as friends
 */
router.get('/search', authenticateToken, async (req, res, next) => {
    try {
        const { query } = req.query;
        if (!query || query.trim().length < 2) {
            return res.status(200).json({ users: [] });
        }

        const usersRes = await db.query(
            `SELECT u.id, u.username, p.display_name, p.avatar, p.typing_level, p.highest_wpm
             FROM users u
             JOIN profiles p ON u.id = p.user_id
             WHERE (u.username ILIKE $1 OR p.display_name ILIKE $1) AND u.id != $2
             LIMIT 10`,
            [`%${query.trim()}%`, req.user.id]
        );

        res.status(200).json({ users: usersRes.rows });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/social/request/send
 * @desc    Send a friend request to a user by ID
 */
router.post('/request/send', authenticateToken, async (req, res, next) => {
    try {
        const { receiverId } = req.body;
        const senderId = req.user.id;

        if (!receiverId || parseInt(receiverId) === senderId) {
            return res.status(400).json({ error: 'Invalid receiver ID.' });
        }

        // Check if already friends
        const is1 = Math.min(senderId, receiverId);
        const is2 = Math.max(senderId, receiverId);
        const friendsCheck = await db.query(
            'SELECT 1 FROM friends WHERE user_id1 = $1 AND user_id2 = $2',
            [is1, is2]
        );

        if (friendsCheck.rows.length > 0) {
            return res.status(400).json({ error: 'You are already friends with this user.' });
        }

        // Check if request already pending
        const requestCheck = await db.query(
            `SELECT 1 FROM friend_requests 
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`,
            [senderId, receiverId]
        );

        if (requestCheck.rows.length > 0) {
            return res.status(400).json({ error: 'A friend request is already pending between you.' });
        }

        // Insert request
        await db.query(
            'INSERT INTO friend_requests (sender_id, receiver_id) VALUES ($1, $2)',
            [senderId, receiverId]
        );

        res.status(200).json({ message: 'Friend request sent successfully.' });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/social/request/accept
 * @desc    Accept a pending friend request
 */
router.post('/request/accept', authenticateToken, async (req, res, next) => {
    try {
        const { senderId } = req.body;
        const receiverId = req.user.id;

        if (!senderId) {
            return res.status(400).json({ error: 'Sender ID is required.' });
        }

        // Verify request exists
        const requestRes = await db.query(
            'SELECT 1 FROM friend_requests WHERE sender_id = $1 AND receiver_id = $2 AND status = \'pending\'',
            [senderId, receiverId]
        );

        if (requestRes.rows.length === 0) {
            return res.status(404).json({ error: 'No pending friend request found from this user.' });
        }

        // Delete request log
        await db.query(
            'DELETE FROM friend_requests WHERE sender_id = $1 AND receiver_id = $2',
            [senderId, receiverId]
        );

        // Add to friends
        const is1 = Math.min(senderId, receiverId);
        const is2 = Math.max(senderId, receiverId);
        await db.query(
            'INSERT INTO friends (user_id1, user_id2, status) VALUES ($1, $2, \'accepted\') ON CONFLICT DO NOTHING',
            [is1, is2]
        );

        res.status(200).json({ message: 'Friend request accepted.' });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/social/request/decline
 * @desc    Decline/Delete a pending friend request
 */
router.post('/request/decline', authenticateToken, async (req, res, next) => {
    try {
        const { senderId } = req.body;
        const receiverId = req.user.id;

        await db.query(
            'DELETE FROM friend_requests WHERE sender_id = $1 AND receiver_id = $2',
            [senderId, receiverId]
        );

        res.status(200).json({ message: 'Friend request declined.' });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/social/chat/:friendId
 * @desc    Get chat message logs with a specific friend
 */
router.get('/chat/:friendId', authenticateToken, async (req, res, next) => {
    try {
        const friendId = parseInt(req.params.friendId);
        const userId = req.user.id;

        const chatRes = await db.query(
            `SELECT id, sender_id, receiver_id, message, created_at
             FROM chats
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
             ORDER BY created_at ASC
             LIMIT 100`,
            [userId, friendId]
        );

        res.status(200).json({ messages: chatRes.rows });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/social/chat/send
 * @desc    Post direct chat message to database
 */
router.post('/chat/send', authenticateToken, async (req, res, next) => {
    try {
        const { receiverId, message } = req.body;
        const senderId = req.user.id;

        if (!receiverId || !message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide receiver and non-empty message.' });
        }

        const msgRes = await db.query(
            'INSERT INTO chats (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *',
            [senderId, receiverId, message.trim()]
        );

        res.status(200).json({ message: 'Message sent successfully.', sentMessage: msgRes.rows[0] });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
