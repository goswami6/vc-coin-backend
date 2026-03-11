const express = require('express');
const router = express.Router();
const { listUsers, toggleBlock } = require('../controllers/adminUserController');

router.get('/', listUsers);
router.put('/:id/toggle-block', toggleBlock);

module.exports = router;
