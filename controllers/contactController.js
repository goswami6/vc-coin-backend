const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { getSetting, setSetting } = require('../models/settingsModel');

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';

const getUserFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch {
    return null;
  }
};

// ─── Ensure tables exist ───
const ensureTables = async () => {
  const pool = db.promise();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_enquiries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL,
      subject VARCHAR(255) DEFAULT '',
      message TEXT NOT NULL,
      status ENUM('new','read','replied') DEFAULT 'new',
      admin_note TEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};
ensureTables().catch(console.error);

// ─── Public: Get contact info from app_settings ───
const getContactInfo = async (req, res) => {
  try {
    const [email, telegram, address, hours] = await Promise.all([
      getSetting('contact_email'),
      getSetting('contact_telegram'),
      getSetting('contact_address'),
      getSetting('contact_hours'),
    ]);
    res.json({
      email: email || 'support@vccoin.com',
      telegram: telegram || '',
      address: address || 'New Delhi, India',
      hours: hours || 'Mon–Sat: 9 AM – 9 PM IST',
    });
  } catch (error) {
    console.error('Get contact info error:', error);
    res.status(500).json({ message: 'Failed to fetch contact info.' });
  }
};

// ─── Public: Submit enquiry ───
const submitEnquiry = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, email and message are required.' });
    }
    const pool = db.promise();
    await pool.query(
      'INSERT INTO contact_enquiries (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim(), (subject || '').trim(), message.trim()]
    );
    res.status(201).json({ message: 'Enquiry submitted successfully.' });
  } catch (error) {
    console.error('Submit enquiry error:', error);
    res.status(500).json({ message: 'Failed to submit enquiry.' });
  }
};

// ─── Admin: Get all enquiries ───
const getEnquiries = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const pool = db.promise();
    const [rows] = await pool.query(
      'SELECT * FROM contact_enquiries ORDER BY createdAt DESC'
    );
    const [countRows] = await pool.query(
      "SELECT COUNT(*) as total, SUM(status='new') as newCount FROM contact_enquiries"
    );
    res.json({ enquiries: rows, total: countRows[0].total, newCount: Number(countRows[0].newCount) || 0 });
  } catch (error) {
    console.error('Get enquiries error:', error);
    res.status(500).json({ message: 'Failed to fetch enquiries.' });
  }
};

// ─── Admin: Update enquiry status ───
const updateEnquiryStatus = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const { id } = req.params;
    const { status, admin_note } = req.body;
    if (!['new', 'read', 'replied'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    const pool = db.promise();
    await pool.query(
      'UPDATE contact_enquiries SET status = ?, admin_note = ? WHERE id = ?',
      [status, admin_note || null, id]
    );
    res.json({ message: 'Enquiry updated.' });
  } catch (error) {
    console.error('Update enquiry error:', error);
    res.status(500).json({ message: 'Failed to update enquiry.' });
  }
};

// ─── Admin: Delete enquiry ───
const deleteEnquiry = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const pool = db.promise();
    await pool.query('DELETE FROM contact_enquiries WHERE id = ?', [req.params.id]);
    res.json({ message: 'Enquiry deleted.' });
  } catch (error) {
    console.error('Delete enquiry error:', error);
    res.status(500).json({ message: 'Failed to delete enquiry.' });
  }
};

// ─── Admin: Update contact info settings ───
const updateContactInfo = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const { email, telegram, address, hours } = req.body;
    if (email !== undefined) await setSetting('contact_email', email);
    if (telegram !== undefined) await setSetting('contact_telegram', telegram);
    if (address !== undefined) await setSetting('contact_address', address);
    if (hours !== undefined) await setSetting('contact_hours', hours);
    res.json({ message: 'Contact info updated.' });
  } catch (error) {
    console.error('Update contact info error:', error);
    res.status(500).json({ message: 'Failed to update contact info.' });
  }
};

module.exports = { getContactInfo, submitEnquiry, getEnquiries, updateEnquiryStatus, deleteEnquiry, updateContactInfo };
