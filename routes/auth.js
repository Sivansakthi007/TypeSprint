const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/error');

// Simple validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user and initialize their profile
 */
router.post('/register', authLimiter, async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        // Input validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Please provide all required fields (username, email, password).' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be between 3 and 20 characters.' });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        // Check if user already exists
        const userExists = await db.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username.toLowerCase().trim(), email.toLowerCase().trim()]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Username or Email is already registered.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert user (db.js handles profile creation automatically for mocks, but for standard SQL we need explicit queries)
        const userResult = await db.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, role',
            [username.trim(), email.toLowerCase().trim(), passwordHash]
        );

        const newUser = userResult.rows[0];

        // Explicitly create profile for real PostgreSQL connection
        if (!db.isMock()) {
            await db.query(
                `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
                [newUser.id, newUser.username]
            );
            
            // Give them starter items/achievements or mission bindings if needed
            // For missions: bind initial state
            const missionsResult = await db.query('SELECT id FROM missions');
            for (const mission of missionsResult.rows) {
                await db.query(
                    'INSERT INTO user_missions (user_id, mission_id, progress, completed) VALUES ($1, $2, 0, false)',
                    [newUser.id, mission.id]
                );
            }
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username, role: newUser.role },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        // Send token in cookie for SPA Client
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 2 * 60 * 60 * 1000 // 2 hours
        });

        res.status(201).json({
            message: 'User registered successfully.',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return token
 */
router.post('/login', authLimiter, async (req, res, next) => {
    try {
        const { usernameOrEmail, password, rememberMe } = req.body;

        if (!usernameOrEmail || !password) {
            return res.status(400).json({ error: 'Please enter username/email and password.' });
        }

        // Search user by email or username
        const userResult = await db.query(
            'SELECT * FROM users WHERE username = $1 OR email = $2',
            [usernameOrEmail.trim(), usernameOrEmail.toLowerCase().trim()]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid username/email or password.' });
        }

        const user = userResult.rows[0];

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid username/email or password.' });
        }

        // Check token expiration based on "Remember Me"
        const expiresIn = rememberMe ? '30d' : '2h';
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn }
        );

        // Update profile last_active timestamp
        await db.query(
            'UPDATE profiles SET last_active = CURRENT_TIMESTAMP WHERE user_id = $1',
            [user.id]
        );

        // Send cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000
        });

        res.status(200).json({
            message: 'Login successful.',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/auth/status
 * @desc    Get current authenticated user info
 */
router.get('/status', async (req, res) => {
    // Read token from authorization header or cookie
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    
    if (!token && req.headers.cookie) {
        const cookies = Object.fromEntries(
            req.headers.cookie.split(';').map(c => c.trim().split('='))
        );
        token = cookies['token'];
    }

    if (!token) {
        return res.status(200).json({ authenticated: false });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Fetch fresh user data + profile
        const userResult = await db.query(
            `SELECT u.id, u.username, u.email, u.role, p.display_name, p.avatar, p.coins, p.xp, p.typing_level, p.equipped_theme
             FROM users u
             JOIN profiles p ON u.id = p.user_id
             WHERE u.id = $1`,
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(200).json({ authenticated: false });
        }

        res.status(200).json({
            authenticated: true,
            user: userResult.rows[0]
        });

    } catch (error) {
        res.status(200).json({ authenticated: false });
    }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (clear cookies)
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.status(200).json({ message: 'Logged out successfully.' });
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Simulate email dispatch for password recovery
 */
router.post('/forgot-password', async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Please enter your email address.' });
        }

        const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (userResult.rows.length === 0) {
            // Keep user guessing for security or return error - let's return success to mock
            return res.status(200).json({ message: 'If this email exists, a password reset link has been sent.' });
        }

        // Return mock success with a generated code for local testing convenience
        const mockCode = Math.floor(100000 + Math.random() * 900000);
        res.status(200).json({
            message: 'If this email exists, a password reset link has been sent.',
            info: 'DEV MOCK: Reset code generated.',
            code: mockCode // for easy dev resetting in UI
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using a mock token/code
 */
router.post('/reset-password', async (req, res, next) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ error: 'Please provide email, validation code, and new password.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
        }

        const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid reset code or email.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);

        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newHash, userResult.rows[0].id]
        );

        res.status(200).json({ message: 'Password reset successfully. You can now login.' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
