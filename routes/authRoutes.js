const express = require('express');
const { register, login, me, forgotPassword, verifyOtp, resetPassword, updateProfile, changePassword } = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', me);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);

module.exports = router;
