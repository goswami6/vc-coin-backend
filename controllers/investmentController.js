const jwt = require('jsonwebtoken');
const {
  createInvestment,
  getInvestmentsByUser,
  getAllInvestments,
  getInvestmentStats,
  completeExpiredInvestments,
  autoRenewInvestments,
  toggleAutoRenew,
  cancelInvestment,
} = require('../models/investmentModel');
const { getWalletBalance } = require('../models/depositModel');
const { creditLevelIncome } = require('../models/levelIncomeModel');

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

// User: invest in a plan
const invest = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { plan_id, plan_name, amount, daily_roi, tenure_days, total_return } = req.body;

    if (!plan_id || !amount) {
      return res.status(400).json({ message: 'Plan ID and amount are required.' });
    }

    // Check wallet balance
    const balance = await getWalletBalance(decoded.sub);
    if (balance < Number(amount)) {
      return res.status(400).json({ message: 'Insufficient balance. Please deposit first.' });
    }

    const investment = await createInvestment({
      user_id: decoded.sub,
      plan_id,
      plan_name: plan_name || '',
      amount: Number(amount),
      daily_roi: Number(daily_roi),
      tenure_days: Number(tenure_days),
      total_return: Number(total_return),
    });

    // Credit level income to upline (non-blocking)
    creditLevelIncome(decoded.sub, Number(amount), investment.id).catch((err) =>
      console.error('Level income credit error:', err)
    );

    res.status(201).json({ investment, message: 'Investment activated successfully!' });
  } catch (error) {
    console.error('Invest error:', error);
    res.status(500).json({ message: 'Failed to create investment.' });
  }
};

// User: get my investments
const myInvestments = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    // Auto-complete expired and auto-renew
    const renewed = await autoRenewInvestments();
    // Credit level income for renewed investments (non-blocking)
    for (const r of renewed) {
      creditLevelIncome(r.user_id, r.amount, r.id).catch((err) =>
        console.error('Level income credit error (renewal):', err)
      );
    }

    const investments = await getInvestmentsByUser(decoded.sub);
    const stats = await getInvestmentStats(decoded.sub);

    // Calculate earned ROI for each investment
    const today = new Date();
    const enriched = investments.map((inv) => {
      const start = new Date(inv.start_date);
      const elapsed = Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
      const daysActive = Math.min(elapsed, inv.tenure_days);
      const dailyAmount = (Number(inv.amount) * Number(inv.daily_roi)) / 100;
      const earned = dailyAmount * daysActive;
      const progress = Math.min(100, (daysActive / inv.tenure_days) * 100);
      return { ...inv, daysActive, dailyAmount, earned, progress };
    });

    res.json({ investments: enriched, stats });
  } catch (error) {
    console.error('My investments error:', error);
    res.status(500).json({ message: 'Failed to fetch investments.' });
  }
};

// Admin: list all investments
const listAll = async (req, res) => {
  try {
    const renewed = await autoRenewInvestments();
    for (const r of renewed) {
      creditLevelIncome(r.user_id, r.amount, r.id).catch((err) =>
        console.error('Level income credit error (renewal):', err)
      );
    }
    const investments = await getAllInvestments();

    const today = new Date();
    let activeCount = 0, activeAmount = 0;
    let completedCount = 0, completedAmount = 0;
    let cancelledCount = 0, cancelledAmount = 0;

    const enriched = investments.map((inv) => {
      const start = new Date(inv.start_date);
      const elapsed = Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
      const daysActive = Math.min(elapsed, inv.tenure_days);
      const dailyAmount = (Number(inv.amount) * Number(inv.daily_roi)) / 100;
      const earned = dailyAmount * daysActive;
      const progress = Math.min(100, (daysActive / inv.tenure_days) * 100);

      if (inv.status === 'active') { activeCount++; activeAmount += Number(inv.amount); }
      else if (inv.status === 'completed') { completedCount++; completedAmount += Number(inv.amount); }
      else { cancelledCount++; cancelledAmount += Number(inv.amount); }

      return { ...inv, daysActive, dailyAmount, earned, progress };
    });

    res.json({
      investments: enriched,
      stats: { activeCount, activeAmount, completedCount, completedAmount, cancelledCount, cancelledAmount },
    });
  } catch (error) {
    console.error('List investments error:', error);
    res.status(500).json({ message: 'Failed to fetch investments.' });
  }
};

// Admin: cancel an investment (refund to wallet)
const cancel = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await cancelInvestment(id);
    if (!result) return res.status(404).json({ message: 'Investment not found.' });
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ investment: result, message: 'Investment cancelled. Amount refunded to wallet.' });
  } catch (error) {
    console.error('Cancel investment error:', error);
    res.status(500).json({ message: 'Failed to cancel investment.' });
  }
};

// User: toggle auto-renew on an investment
const toggleRenew = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const result = await toggleAutoRenew(Number(id), decoded.sub);
    if (!result) return res.status(404).json({ message: 'Investment not found.' });

    res.json({
      investment: result,
      message: result.auto_renew ? 'Auto-renewal enabled' : 'Auto-renewal disabled',
    });
  } catch (error) {
    console.error('Toggle renew error:', error);
    res.status(500).json({ message: 'Failed to toggle auto-renewal.' });
  }
};

module.exports = { invest, myInvestments, listAll, cancel, toggleRenew };
