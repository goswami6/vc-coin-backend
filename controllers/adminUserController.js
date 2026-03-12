const jwt = require('jsonwebtoken');
const { getAllUsers, toggleBlockUser, findUserById } = require('../models/userModel');
const { getAvailableBalance, getDepositStats, ensureDepositsTable } = require('../models/depositModel');
const db = require('../config/db');
const dbPromise = db.promise();

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';

const getAdmin = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded?.user_type === 'admin' ? decoded : null;
  } catch { return null; }
};

const listUsers = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });
    const users = await getAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('listUsers error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const toggleBlock = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });

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

// Admin: get detailed info for a single user
const getUserDetail = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });

    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ message: 'Invalid user ID' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const balance = await getAvailableBalance(userId);
    const depositStats = await getDepositStats(userId);

    // Investment stats
    let investmentStats = { activeCount: 0, activeAmount: 0, totalCount: 0, totalAmount: 0 };
    try {
      const [active] = await dbPromise.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM user_investments WHERE user_id = ? AND status = 'active'`, [userId]
      );
      const [total] = await dbPromise.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM user_investments WHERE user_id = ?`, [userId]
      );
      investmentStats = {
        activeCount: active[0].count, activeAmount: Number(active[0].amount),
        totalCount: total[0].count, totalAmount: Number(total[0].amount),
      };
    } catch { }

    // Referral info
    let referralCount = 0;
    try {
      const [refs] = await dbPromise.query(`SELECT COUNT(*) as c FROM users WHERE referred_by = ?`, [userId]);
      referralCount = refs[0].c;
    } catch { }

    // Withdrawal stats
    let withdrawalStats = { totalAmount: 0, totalCount: 0 };
    try {
      const [w] = await dbPromise.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM withdrawals WHERE user_id = ? AND status = 'approved'`, [userId]
      );
      withdrawalStats = { totalAmount: Number(w[0].amount), totalCount: w[0].count };
    } catch { }

    const { password, ...safeUser } = user;
    res.json({
      user: safeUser, balance, depositStats, investmentStats, withdrawalStats, referralCount,
    });
  } catch (err) {
    console.error('getUserDetail error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: add VC coins to user's wallet (creates an approved deposit)
const addWallet = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });

    const userId = parseInt(req.params.id, 10);
    const { amount, note } = req.body;

    if (!userId) return res.status(400).json({ message: 'Invalid user ID' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Amount must be greater than 0' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await ensureDepositsTable();
    await dbPromise.query(
      `INSERT INTO deposits (user_id, amount, method, txn_id, status, admin_note) VALUES (?, ?, 'admin', ?, 'approved', ?)`,
      [userId, Number(amount), `ADMIN-ADD-${Date.now()}`, note || 'Added by admin']
    );

    const balance = await getAvailableBalance(userId);
    res.json({ message: `${Number(amount)} VC added to user's wallet`, balance });
  } catch (err) {
    console.error('addWallet error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { listUsers, toggleBlock, getUserDetail, addWallet };
