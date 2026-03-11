const jwt = require('jsonwebtoken');
const {
  createDeposit,
  getDepositsByUser,
  getAllDeposits,
  updateDepositStatus,
  getWalletBalance,
  getDepositStats,
  getInrBalance,
} = require('../models/depositModel');
const { getSetting } = require('../models/settingsModel');

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';

// Extract user from token
const getUserFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch {
    return null;
  }
};

// User: create deposit request
const create = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { amount, method, txn_id } = req.body;

    // Dynamic limits from settings
    const minAmt = Number(await getSetting('deposit_min')) || 500;
    const maxAmt = Number(await getSetting('deposit_max')) || 1000000;

    if (!amount || Number(amount) < minAmt) {
      return res.status(400).json({ message: `Minimum deposit is \u20B9${minAmt.toLocaleString('en-IN')}.` });
    }
    if (Number(amount) > maxAmt) {
      return res.status(400).json({ message: `Maximum deposit is \u20B9${maxAmt.toLocaleString('en-IN')}.` });
    }
    if (!txn_id) {
      return res.status(400).json({ message: 'Transaction ID / UTR is required.' });
    }

    const screenshot = req.file ? `/uploads/${req.file.filename}` : null;

    const deposit = await createDeposit({
      user_id: decoded.sub,
      amount: Number(amount),
      method: method || 'upi',
      txn_id,
      screenshot,
    });

    res.status(201).json({ deposit, message: 'Deposit request submitted. Awaiting admin approval.' });
  } catch (error) {
    console.error('Create deposit error:', error);
    res.status(500).json({ message: 'Failed to submit deposit.' });
  }
};

// User: get my deposits
const myDeposits = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const deposits = await getDepositsByUser(decoded.sub);
    const stats = await getDepositStats(decoded.sub);
    const balance = await getWalletBalance(decoded.sub);

    res.json({ deposits, stats, balance });
  } catch (error) {
    console.error('My deposits error:', error);
    res.status(500).json({ message: 'Failed to fetch deposits.' });
  }
};

// User: get wallet balance
const balance = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const db = require('../config/db');
    const dbP = db.promise();
    const bal = await getWalletBalance(decoded.sub);
    const inrBal = await getInrBalance(decoded.sub);

    // Total deposits (approved)
    let totalDeposits = 0;
    try {
      const [d] = await dbP.query(
        "SELECT COALESCE(SUM(amount),0) as t FROM deposits WHERE user_id = ? AND status = 'approved'",
        [decoded.sub]
      );
      totalDeposits = Number(d[0].t);
    } catch { }

    // Total invested (active + completed)
    let totalInvested = 0;
    try {
      const [i] = await dbP.query(
        "SELECT COALESCE(SUM(amount),0) as t FROM user_investments WHERE user_id = ? AND status IN ('active','completed')",
        [decoded.sub]
      );
      totalInvested = Number(i[0].t);
    } catch { }

    res.json({ balance: bal, inrBalance: inrBal, totalDeposits, totalInvested });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ message: 'Failed to fetch balance.' });
  }
};

// Admin: get all deposits
const listAll = async (req, res) => {
  try {
    const deposits = await getAllDeposits();
    res.json({ deposits });
  } catch (error) {
    console.error('List deposits error:', error);
    res.status(500).json({ message: 'Failed to fetch deposits.' });
  }
};

// Admin: approve/reject deposit
const updateStatus = async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    const { id } = req.params;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected.' });
    }

    const deposit = await updateDepositStatus(id, status, admin_note);
    if (!deposit) return res.status(404).json({ message: 'Deposit not found.' });

    res.json({ deposit, message: `Deposit ${status} successfully.` });
  } catch (error) {
    console.error('Update deposit error:', error);
    res.status(500).json({ message: 'Failed to update deposit.' });
  }
};

module.exports = { create, myDeposits, balance, listAll, updateStatus };
