const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { getVcRate, updateVcRate, getDepositSettings, updateDepositSettings } = require('../controllers/settingsController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `qr-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Public
router.get('/vc-rate', getVcRate);
router.get('/deposit', getDepositSettings);

// Admin
router.put('/vc-rate', updateVcRate);
router.put('/deposit', upload.single('qr_image'), updateDepositSettings);

module.exports = router;
