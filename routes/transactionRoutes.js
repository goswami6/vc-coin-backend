const express = require('express');
const { myTransactions, allTransactions } = require('../controllers/transactionController');

const router = express.Router();

router.get('/my', myTransactions);
router.get('/all', allTransactions);

module.exports = router;
