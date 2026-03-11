const express = require('express');
const { getDashboard } = require('../controllers/adminDashboardController');
const router = express.Router();

router.get('/', getDashboard);

module.exports = router;
