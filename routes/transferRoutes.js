const express = require('express');
const { send, myTransfers } = require('../controllers/transferController');

const router = express.Router();

router.post('/send', send);
router.get('/my', myTransfers);

module.exports = router;
