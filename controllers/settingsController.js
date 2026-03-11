const jwt = require('jsonwebtoken');
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

// Public: get VC rate
const getVcRate = async (req, res) => {
  try {
    const rate = await getSetting('vc_rate');
    res.json({ vc_rate: Number(rate) || 50 });
  } catch (error) {
    console.error('Get VC rate error:', error);
    res.status(500).json({ message: 'Failed to fetch rate.' });
  }
};

// Admin: update VC rate
const updateVcRate = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { vc_rate } = req.body;
    if (!vc_rate || Number(vc_rate) <= 0) {
      return res.status(400).json({ message: 'Enter a valid rate.' });
    }

    await setSetting('vc_rate', String(Number(vc_rate)));
    res.json({ vc_rate: Number(vc_rate), message: `VC rate updated to ₹${Number(vc_rate).toFixed(2)}` });
  } catch (error) {
    console.error('Update VC rate error:', error);
    res.status(500).json({ message: 'Failed to update rate.' });
  }
};

// Public: get deposit settings (UPI, QR, min, max)
const getDepositSettings = async (req, res) => {
  try {
    const [upiId, qrImage, minAmt, maxAmt] = await Promise.all([
      getSetting('deposit_upi_id'),
      getSetting('deposit_qr_image'),
      getSetting('deposit_min'),
      getSetting('deposit_max'),
    ]);
    res.json({
      upi_id: upiId || '',
      qr_image: qrImage || '',
      min_amount: Number(minAmt) || 500,
      max_amount: Number(maxAmt) || 1000000,
    });
  } catch (error) {
    console.error('Get deposit settings error:', error);
    res.status(500).json({ message: 'Failed to fetch deposit settings.' });
  }
};

// Admin: update deposit settings
const updateDepositSettings = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded || decoded.user_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { upi_id, min_amount, max_amount } = req.body;
    const qrImage = req.file ? `/uploads/${req.file.filename}` : null;

    if (upi_id !== undefined) await setSetting('deposit_upi_id', upi_id);
    if (qrImage) await setSetting('deposit_qr_image', qrImage);
    if (min_amount !== undefined && Number(min_amount) >= 0) await setSetting('deposit_min', String(Number(min_amount)));
    if (max_amount !== undefined && Number(max_amount) > 0) await setSetting('deposit_max', String(Number(max_amount)));

    const updated = {
      upi_id: upi_id !== undefined ? upi_id : await getSetting('deposit_upi_id'),
      qr_image: qrImage || await getSetting('deposit_qr_image'),
      min_amount: Number(min_amount !== undefined ? min_amount : await getSetting('deposit_min')),
      max_amount: Number(max_amount !== undefined ? max_amount : await getSetting('deposit_max')),
    };

    res.json({ ...updated, message: 'Deposit settings updated successfully.' });
  } catch (error) {
    console.error('Update deposit settings error:', error);
    res.status(500).json({ message: 'Failed to update deposit settings.' });
  }
};

module.exports = { getVcRate, updateVcRate, getDepositSettings, updateDepositSettings };
