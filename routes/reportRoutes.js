const express = require('express');
const router = express.Router();
const { getReport, getReportDetails } = require('../controllers/reportController');

router.get('/', getReport);
router.get('/details', getReportDetails);

module.exports = router;
