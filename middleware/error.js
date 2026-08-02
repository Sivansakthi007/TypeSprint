const rateLimit = require('express-rate-limit');

/**
 * Standard API Rate Limiter to prevent brute-force attacks on auth
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * General API Limiter for practice routes
 */
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // Limit each IP to 200 requests per minute
    message: { error: 'Too many API requests. Please slow down.' }
});

/**
 * Express error handler middleware
 */
function errorHandler(err, req, res, next) {
    console.error('Unhandled Server Error:', err);

    const statusCode = err.status || 500;
    const response = {
        error: err.message || 'Internal Server Error'
    };

    // Return stack trace only in development
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
}

module.exports = {
    authLimiter,
    apiLimiter,
    errorHandler
};
