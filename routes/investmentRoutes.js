const express = require('express');
const { invest, myInvestments, listAll, cancel, toggleRenew } = require('../controllers/investmentController');

const router = express.Router();

// User routes
router.post('/', invest);
router.get('/my', myInvestments);
router.put('/:id/toggle-renew', toggleRenew);

// Admin routes
router.get('/all', listAll);
router.put('/:id/cancel', cancel);

module.exports = router;
