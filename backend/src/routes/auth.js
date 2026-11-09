
const express = require('express');
const router = express.Router();

const {
  register,
  login,
  getCurrentUser,
  logout
} = require('../controllers/authController');

const { authenticateUser } = require('../middleware/authMiddleware');

// Registration
router.post('/register', register);

// Login
router.post('/login', login);

// Get current authenticated user
router.get('/me', authenticateUser, getCurrentUser);

// Logout
router.post('/logout', logout);

module.exports = router;
