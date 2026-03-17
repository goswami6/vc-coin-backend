const express = require('express');
const router = express.Router();
const { create, myTickets, listAll, messages, sendMessage, changeStatus } = require('../controllers/supportController');

// User routes
router.post('/', create);
router.get('/my', myTickets);

// Admin routes
router.get('/all', listAll);
router.put('/:id/status', changeStatus);

// Shared routes (user or admin)
router.get('/:id/messages', messages);
router.post('/:id/messages', sendMessage);

module.exports = router;
