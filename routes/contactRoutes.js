const express = require('express');
const router = express.Router();
const {
  getContactInfo,
  submitEnquiry,
  getEnquiries,
  updateEnquiryStatus,
  deleteEnquiry,
  updateContactInfo,
} = require('../controllers/contactController');

// Public
router.get('/info', getContactInfo);
router.post('/', submitEnquiry);

// Admin
router.get('/enquiries', getEnquiries);
router.put('/enquiries/:id', updateEnquiryStatus);
router.delete('/enquiries/:id', deleteEnquiry);
router.put('/info', updateContactInfo);

module.exports = router;
