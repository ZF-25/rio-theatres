
const express = require('express');
const router = express.Router();

const {
  register,
  login,
  getCurrentUser,
  getSession,
  logout
} = require('../controllers/authController');

const { authenticateUser } = require('../middleware/authMiddleware');
const { verifyCsrfToken } = require('../middleware/csrfMiddleware');

const {
  loginRateLimiter,
  registerRateLimiter
} = require('../middleware/rateLimitMiddleware');

// Registration and login with CSRF protection and rate limiting.
router.post('/register', registerRateLimiter, verifyCsrfToken, register);
router.post('/login', loginRateLimiter, verifyCsrfToken, login);

// Logout
router.post('/logout', verifyCsrfToken, logout);

// Get or create the current session (guest or authenticated).
router.get('/session', getSession);

// Get current authenticated user.
router.get('/me', authenticateUser, getCurrentUser);

module.exports = router;
