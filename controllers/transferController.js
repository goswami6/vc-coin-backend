const jwt = require('jsonwebtoken');
const { createTransfer, getTransfersByUser, getTransferBalance } = require('../models/transferModel');
const { getAvailableBalance } = require('../models/depositModel');
const { findUserByEmail, findUserByMobile } = require('../models/userModel');

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

// User: send VC coins to another user
const send = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { receiver_identifier, amount, note } = req.body;

    if (!receiver_identifier) {
      return res.status(400).json({ message: 'Enter email or mobile of the receiver.' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Enter a valid amount.' });
    }
    if (Number(amount) < 10) {
      return res.status(400).json({ message: 'Minimum transfer is 10 VC.' });
    }

    // Find receiver by email or mobile
    let receiver = await findUserByEmail(receiver_identifier);
    if (!receiver) {
      receiver = await findUserByMobile(receiver_identifier);
    }
    if (!receiver) {
      return res.status(404).json({ message: 'User not found. Check the email or mobile number.' });
    }
    if (receiver.id === decoded.sub) {
      return res.status(400).json({ message: 'You cannot transfer to yourself.' });
    }

    // Check available balance (prevents overspending into negative)
    const { available } = await getAvailableBalance(decoded.sub);
    if (available < Number(amount)) {
      return res.status(400).json({ message: `Insufficient balance. You have ${Math.max(0, available).toFixed(2)} VC.` });
    }

    const transfer = await createTransfer({
      sender_id: decoded.sub,
      receiver_id: receiver.id,
      amount: Number(amount),
      note,
    });

    res.status(201).json({
      transfer,
      receiver_name: receiver.name,
      message: `${Number(amount)} VC sent to ${receiver.name} successfully!`,
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ message: 'Transfer failed.' });
  }
};

// User: get my transfers
const myTransfers = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const transfers = await getTransfersByUser(decoded.sub);
    const netBalance = await getTransferBalance(decoded.sub);

    // Calculate sent/received totals
    let totalSent = 0, totalReceived = 0;
    transfers.forEach((t) => {
      if (t.sender_id === decoded.sub) totalSent += Number(t.amount);
      else totalReceived += Number(t.amount);
    });

    res.json({ transfers, totalSent, totalReceived, netBalance });
  } catch (error) {
    console.error('My transfers error:', error);
    res.status(500).json({ message: 'Failed to fetch transfers.' });
  }
};

module.exports = { send, myTransfers };
