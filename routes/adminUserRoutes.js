const express = require('express');
const router = express.Router();
const { listUsers, toggleBlock, getUserDetail, addWallet } = require('../controllers/adminUserController');

router.get('/', listUsers);
router.get('/:id/detail', getUserDetail);
router.put('/:id/toggle-block', toggleBlock);
router.post('/:id/add-wallet', addWallet);

module.exports = router;
