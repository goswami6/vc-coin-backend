const express = require('express');
const { myReferralInfo, dashboardStats, myTeamMembers, allLevelIncomes } = require('../controllers/referralController');

const router = express.Router();

router.get('/my', myReferralInfo);
router.get('/team', myTeamMembers);
router.get('/dashboard-stats', dashboardStats);
router.get('/all', allLevelIncomes);

module.exports = router;
