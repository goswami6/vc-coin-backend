const express = require('express');
const multer = require('multer');
const path = require('path');
const { create, list, listActive, getOne, update, remove } = require('../controllers/planController');

const router = express.Router();

// Multer config for plan images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    if (!allowed.includes(ext.toLowerCase())) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, `plan-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Admin routes
router.post('/', upload.single('image'), create);
router.get('/', list);
router.get('/active', listActive);
router.get('/:id', getOne);
router.put('/:id', upload.single('image'), update);
router.delete('/:id', remove);

module.exports = router;
