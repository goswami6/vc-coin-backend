const jwt = require('jsonwebtoken');
const db = require('../config/db');
const dbPromise = db.promise();
const { findUserById, getDirectReferrals } = require('../models/userModel');
const { getLevelIncomesByUser, getLevelIncomeStats, getAllLevelIncomes, LEVEL_PERCENTAGES } = require('../models/levelIncomeModel');

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

// GET /api/referrals/my - user's referral info, team, level income
exports.myReferralInfo = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const user = await findUserById(decoded.sub);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const directReferrals = await getDirectReferrals(decoded.sub);
    const incomeStats = await getLevelIncomeStats(decoded.sub);
    const recentIncomes = await getLevelIncomesByUser(decoded.sub);

    // Count team by levels (recursive)
    const teamByLevel = [];
    let currentLevelIds = [decoded.sub];
    for (let lvl = 1; lvl <= 6; lvl++) {
      if (currentLevelIds.length === 0) {
        teamByLevel.push({ level: lvl, count: 0, percentage: LEVEL_PERCENTAGES[lvl - 1] });
        continue;
      }
      const placeholders = currentLevelIds.map(() => '?').join(',');
      const [rows] = await dbPromise.query(
        `SELECT id FROM users WHERE referred_by IN (${placeholders})`,
        currentLevelIds
      );
      teamByLevel.push({ level: lvl, count: rows.length, percentage: LEVEL_PERCENTAGES[lvl - 1] });
      currentLevelIds = rows.map(r => r.id);
    }

    const totalTeam = teamByLevel.reduce((s, l) => s + l.count, 0);

    res.json({
      referral_code: user.referral_code || '',
      directReferrals,
      totalTeam,
      teamByLevel,
      incomeStats,
      recentIncomes: recentIncomes.slice(0, 50),
    });
  } catch (err) {
    console.error('myReferralInfo error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/referrals/dashboard-stats - lightweight stats for dashboard
exports.dashboardStats = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const user = await findUserById(decoded.sub);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const directReferrals = await getDirectReferrals(decoded.sub);
    const incomeStats = await getLevelIncomeStats(decoded.sub);

    res.json({
      referral_code: user.referral_code || '',
      directCount: directReferrals.length,
      totalIncome: incomeStats.totalIncome,
    });
  } catch (err) {
    console.error('dashboardStats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/referrals/team - full team members by level
exports.myTeamMembers = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });

    const levels = [];
    let currentLevelIds = [decoded.sub];
    for (let lvl = 1; lvl <= 6; lvl++) {
      if (currentLevelIds.length === 0) {
        levels.push({ level: lvl, percentage: LEVEL_PERCENTAGES[lvl - 1], members: [] });
        continue;
      }
      const placeholders = currentLevelIds.map(() => '?').join(',');
      const [rows] = await dbPromise.query(
        `SELECT u.id, u.name, u.email, u.mobile, u.created_at AS createdAt,
                COALESCE(inv.total,0) AS totalInvested,
                COALESCE(li.earned,0) AS incomeEarned
         FROM users u
         LEFT JOIN (SELECT user_id, SUM(amount) AS total FROM user_investments WHERE status='active' GROUP BY user_id) inv ON inv.user_id = u.id
         LEFT JOIN (SELECT from_user_id, SUM(amount) AS earned FROM level_incomes WHERE user_id = ? AND level = ? GROUP BY from_user_id) li ON li.from_user_id = u.id
         WHERE u.referred_by IN (${placeholders})
         ORDER BY u.created_at DESC`,
        [decoded.sub, lvl, ...currentLevelIds]
      );
      levels.push({ level: lvl, percentage: LEVEL_PERCENTAGES[lvl - 1], members: rows });
      currentLevelIds = rows.map(r => r.id);
    }

    const totalMembers = levels.reduce((s, l) => s + l.members.length, 0);
    res.json({ levels, totalMembers });
  } catch (err) {
    console.error('myTeamMembers error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/referrals/all - admin: all level incomes
exports.allLevelIncomes = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });
    if (decoded.user_type !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    const incomes = await getAllLevelIncomes();
    const [totalRow] = await dbPromise.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM level_incomes'
    );

    res.json({ incomes, totalPaid: Number(totalRow[0].total) });
  } catch (err) {
    console.error('allLevelIncomes error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
