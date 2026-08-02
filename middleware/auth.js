const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'typesprint_jwt_super_secret_key_12345';

/**
 * Middleware to authenticate requests using JWT tokens
 */
function authenticateToken(req, res, next) {
    // Read from header or cookies
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    
    if (!token && req.headers.cookie) {
        // Simple cookie parsing fallback
        const cookies = Object.fromEntries(
            req.headers.cookie.split(';').map(c => c.trim().split('='))
        );
        token = cookies['token'];
    }

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No authentication token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, username, role }
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired authentication token.' });
    }
}

/**
 * Middleware to restrict route access to administrators
 */
function authorizeAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access restricted to administrators only.' });
    }
    next();
}

module.exports = {
    authenticateToken,
    authorizeAdmin,
    JWT_SECRET
};
