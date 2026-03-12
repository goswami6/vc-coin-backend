const jwt = require('jsonwebtoken');
const {
  createWithdrawal,
  getWithdrawalsByUser,
  getAllWithdrawals,
  getWithdrawalById,
  updateWithdrawalStatus,
  getTotalWithdrawn,
  getPendingWithdrawals,
} = require('../models/withdrawModel');
const { getAvailableBalance } = require('../models/depositModel');

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

// User: request withdrawal
const requestWithdraw = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { amount, method, account_details } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Enter a valid amount.' });
    }
    if (Number(amount) < 10) {
      return res.status(400).json({ message: 'Minimum withdrawal is 10 VC.' });
    }
    if (!account_details || !account_details.trim()) {
      return res.status(400).json({ message: 'Enter your payment details (UPI ID / Bank details).' });
    }

    // Centralized available balance guard (already handles locks and pending withdrawals)
    const { available } = await getAvailableBalance(decoded.sub);

    if (available < Number(amount)) {
      return res.status(400).json({
        message: `Insufficient balance. You have ${Math.max(0, available).toFixed(2)} VC available.`,
      });
    }

    const withdrawal = await createWithdrawal({
      user_id: decoded.sub,
      amount: Number(amount),
      method: method || 'upi',
      account_details: account_details.trim(),
    });

    res.status(201).json({ withdrawal, message: 'Withdrawal request submitted! Waiting for admin approval.' });
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({ message: 'Failed to submit withdrawal request.' });
  }
};

// User: my withdrawals
const myWithdrawals = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const withdrawals = await getWithdrawalsByUser(decoded.sub);
    const totalWithdrawn = await getTotalWithdrawn(decoded.sub);
    const pendingAmount = await getPendingWithdrawals(decoded.sub);

    res.json({ withdrawals, totalWithdrawn, pendingAmount });
  } catch (error) {
    console.error('My withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch withdrawals.' });
  }
};

// Admin: list all withdrawals
const listAll = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const withdrawals = await getAllWithdrawals();

    let pending = 0, approved = 0, rejected = 0;
    let pendingAmount = 0, approvedAmount = 0;
    withdrawals.forEach((w) => {
      if (w.status === 'pending') { pending++; pendingAmount += Number(w.amount); }
      else if (w.status === 'approved') { approved++; approvedAmount += Number(w.amount); }
      else if (w.status === 'rejected') rejected++;
    });

    res.json({
      withdrawals,
      stats: { pending, approved, rejected, pendingAmount, approvedAmount },
    });
  } catch (error) {
    console.error('Admin withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch withdrawals.' });
  }
};

// Admin: approve / reject withdrawal
const updateStatus = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use approved or rejected.' });
    }

    const withdrawal = await getWithdrawalById(id);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found.' });
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'This withdrawal has already been processed.' });
    }

    const updated = await updateWithdrawalStatus(id, status, admin_note);
    res.json({ withdrawal: updated, message: `Withdrawal ${status} successfully.` });
  } catch (error) {
    console.error('Admin update withdrawal error:', error);
    res.status(500).json({ message: 'Failed to update withdrawal.' });
  }
};

module.exports = { requestWithdraw, myWithdrawals, listAll, updateStatus };
