const jwt = require('jsonwebtoken');
const { getAllUsers, toggleBlockUser } = require('../models/userModel');

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';

const listUsers = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }

    const users = await getAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('listUsers error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const toggleBlock = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }

    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ message: 'Invalid user ID' });

    const updated = await toggleBlockUser(userId);
    if (!updated) return res.status(404).json({ message: 'User not found' });

    res.json({ message: updated.is_blocked ? 'User blocked' : 'User unblocked', user: updated });
  } catch (err) {
    console.error('toggleBlock error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { listUsers, toggleBlock };
