const express = require('express');
const multer = require('multer');
const path = require('path');
const { create, myDeposits, balance, listAll, updateStatus } = require('../controllers/depositController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (!allowed.includes(ext.toLowerCase())) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, `deposit-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// User routes
router.post('/', upload.single('screenshot'), create);
router.get('/my', myDeposits);
router.get('/balance', balance);

// Admin routes
router.get('/all', listAll);
router.put('/:id/status', updateStatus);

module.exports = router;
