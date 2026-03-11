const express = require('express');
const router = express.Router();
const { requestWithdraw, myWithdrawals, listAll, updateStatus } = require('../controllers/withdrawController');

// User routes
router.post('/', requestWithdraw);
router.get('/my', myWithdrawals);

// Admin routes
router.get('/all', listAll);
router.put('/:id/status', updateStatus);

module.exports = router;
