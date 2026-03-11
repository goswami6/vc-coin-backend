const jwt = require('jsonwebtoken');
const db = require('../config/db');
const dbPromise = db.promise();

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';

const getAdmin = (req) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    return decoded.user_type === 'admin' ? decoded : null;
  } catch { return null; }
};

// GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
exports.getReport = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });

    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ message: 'from and to dates required' });

    const start = from + ' 00:00:00';
    const end = to + ' 23:59:59';

    // Users registered
    const [usersRows] = await dbPromise.query(
      `SELECT COUNT(*) AS count FROM users WHERE created_at BETWEEN ? AND ?`, [start, end]
    );

    // Deposits
    const [depTotal] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM deposits WHERE createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [depApproved] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM deposits WHERE status='approved' AND createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [depPending] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM deposits WHERE status='pending' AND createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [depRejected] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM deposits WHERE status='rejected' AND createdAt BETWEEN ? AND ?`, [start, end]
    );

    // Withdrawals
    const [withTotal] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [withApproved] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE status='approved' AND createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [withPending] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE status='pending' AND createdAt BETWEEN ? AND ?`, [start, end]
    );

    // Investments
    const [invTotal] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM user_investments WHERE createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [invActive] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM user_investments WHERE status='active' AND createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [invCompleted] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM user_investments WHERE status='completed' AND createdAt BETWEEN ? AND ?`, [start, end]
    );

    // P2P Transfers
    const [transfers] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM p2p_transfers WHERE createdAt BETWEEN ? AND ?`, [start, end]
    );

    // Marketplace
    const [mkTotal] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_price),0) AS total FROM sell_orders WHERE createdAt BETWEEN ? AND ?`, [start, end]
    );
    const [mkCompleted] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_price),0) AS total FROM sell_orders WHERE status='completed' AND createdAt BETWEEN ? AND ?`, [start, end]
    );

    // Level Income
    const [levelIncome] = await dbPromise.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM level_incomes WHERE createdAt BETWEEN ? AND ?`, [start, end]
    );

    // Daily breakdown for chart
    const [dailyDeposits] = await dbPromise.query(
      `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS date, COALESCE(SUM(amount),0) AS total FROM deposits WHERE status='approved' AND createdAt BETWEEN ? AND ? GROUP BY date ORDER BY date`, [start, end]
    );
    const [dailyWithdrawals] = await dbPromise.query(
      `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS date, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE status='approved' AND createdAt BETWEEN ? AND ? GROUP BY date ORDER BY date`, [start, end]
    );
    const [dailyInvestments] = await dbPromise.query(
      `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS date, COALESCE(SUM(amount),0) AS total FROM user_investments WHERE createdAt BETWEEN ? AND ? GROUP BY date ORDER BY date`, [start, end]
    );
    const [dailyUsers] = await dbPromise.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count FROM users WHERE created_at BETWEEN ? AND ? GROUP BY date ORDER BY date`, [start, end]
    );

    res.json({
      period: { from, to },
      users: { registered: usersRows[0].count },
      deposits: {
        total: { count: depTotal[0].count, amount: Number(depTotal[0].total) },
        approved: { count: depApproved[0].count, amount: Number(depApproved[0].total) },
        pending: { count: depPending[0].count, amount: Number(depPending[0].total) },
        rejected: { count: depRejected[0].count, amount: Number(depRejected[0].total) },
      },
      withdrawals: {
        total: { count: withTotal[0].count, amount: Number(withTotal[0].total) },
        approved: { count: withApproved[0].count, amount: Number(withApproved[0].total) },
        pending: { count: withPending[0].count, amount: Number(withPending[0].total) },
      },
      investments: {
        total: { count: invTotal[0].count, amount: Number(invTotal[0].total) },
        active: { count: invActive[0].count, amount: Number(invActive[0].total) },
        completed: { count: invCompleted[0].count, amount: Number(invCompleted[0].total) },
      },
      transfers: { count: transfers[0].count, amount: Number(transfers[0].total) },
      marketplace: {
        total: { count: mkTotal[0].count, amount: Number(mkTotal[0].total) },
        completed: { count: mkCompleted[0].count, amount: Number(mkCompleted[0].total) },
      },
      levelIncome: { count: levelIncome[0].count, amount: Number(levelIncome[0].total) },
      daily: {
        deposits: dailyDeposits.map(r => ({ date: r.date, total: Number(r.total) })),
        withdrawals: dailyWithdrawals.map(r => ({ date: r.date, total: Number(r.total) })),
        investments: dailyInvestments.map(r => ({ date: r.date, total: Number(r.total) })),
        users: dailyUsers.map(r => ({ date: r.date, count: r.count })),
      },
    });
  } catch (err) {
    console.error('getReport error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/admin/reports/details?from=&to=&type=deposits|withdrawals|investments|transfers|marketplace|level_income|users
exports.getReportDetails = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });

    const { from, to, type } = req.query;
    if (!from || !to || !type) return res.status(400).json({ message: 'from, to, type required' });

    const start = from + ' 00:00:00';
    const end = to + ' 23:59:59';
    let rows = [];

    if (type === 'deposits') {
      [rows] = await dbPromise.query(
        `SELECT d.id, u.name, u.email, u.mobile, d.amount, d.method, d.txn_id, d.status, d.createdAt
         FROM deposits d JOIN users u ON u.id = d.user_id
         WHERE d.createdAt BETWEEN ? AND ? ORDER BY d.createdAt DESC`, [start, end]
      );
    } else if (type === 'withdrawals') {
      [rows] = await dbPromise.query(
        `SELECT w.id, u.name, u.email, u.mobile, w.amount, w.method, w.account_details, w.status, w.createdAt
         FROM withdrawals w JOIN users u ON u.id = w.user_id
         WHERE w.createdAt BETWEEN ? AND ? ORDER BY w.createdAt DESC`, [start, end]
      );
    } else if (type === 'investments') {
      [rows] = await dbPromise.query(
        `SELECT i.id, u.name, u.email, u.mobile, i.plan_name, i.amount, i.daily_roi, i.tenure_days, i.total_return, i.start_date, i.end_date, i.status, i.createdAt
         FROM user_investments i JOIN users u ON u.id = i.user_id
         WHERE i.createdAt BETWEEN ? AND ? ORDER BY i.createdAt DESC`, [start, end]
      );
    } else if (type === 'transfers') {
      [rows] = await dbPromise.query(
        `SELECT t.id, s.name AS sender_name, s.email AS sender_email, r.name AS receiver_name, r.email AS receiver_email, t.amount, t.note, t.createdAt
         FROM p2p_transfers t JOIN users s ON s.id = t.sender_id JOIN users r ON r.id = t.receiver_id
         WHERE t.createdAt BETWEEN ? AND ? ORDER BY t.createdAt DESC`, [start, end]
      );
    } else if (type === 'marketplace') {
      [rows] = await dbPromise.query(
        `SELECT o.id, s.name AS seller_name, s.email AS seller_email, b.name AS buyer_name, o.amount, o.price_per_vc, o.total_price, o.fee_amount, o.net_amount, o.status, o.createdAt
         FROM sell_orders o JOIN users s ON s.id = o.seller_id LEFT JOIN users b ON b.id = o.buyer_id
         WHERE o.createdAt BETWEEN ? AND ? ORDER BY o.createdAt DESC`, [start, end]
      );
    } else if (type === 'level_income') {
      [rows] = await dbPromise.query(
        `SELECT l.id, u.name AS user_name, u.email AS user_email, f.name AS from_user_name, l.level, l.percentage, l.amount, l.createdAt
         FROM level_incomes l JOIN users u ON u.id = l.user_id JOIN users f ON f.id = l.from_user_id
         WHERE l.createdAt BETWEEN ? AND ? ORDER BY l.createdAt DESC`, [start, end]
      );
    } else if (type === 'users') {
      [rows] = await dbPromise.query(
        `SELECT u.id, u.name, u.email, u.mobile, u.referral_code, r.name AS referred_by_name, u.created_at
         FROM users u LEFT JOIN users r ON r.id = u.referred_by
         WHERE u.created_at BETWEEN ? AND ? ORDER BY u.created_at DESC`, [start, end]
      );
    } else {
      return res.status(400).json({ message: 'Invalid type' });
    }

    res.json({ type, records: rows });
  } catch (err) {
    console.error('getReportDetails error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
