const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const {
  createOrder,
  myOrders,
  marketplace,
  buyOrder,
  adminListAll,
  adminUpdateStatus,
} = require('../controllers/marketplaceController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `market-proof-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// User routes
router.post('/', createOrder);
router.get('/my', myOrders);
router.get('/browse', marketplace);
router.post('/buy/:id', upload.single('screenshot'), buyOrder);

// Admin routes
router.get('/all', adminListAll);
router.put('/:id/status', adminUpdateStatus);

module.exports = router;
