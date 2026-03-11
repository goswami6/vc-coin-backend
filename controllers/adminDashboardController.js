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

// Safe query helper – returns default row if table doesn't exist yet
const safeQuery = async (sql, fallback = [{ c: 0, total: 0 }]) => {
  try {
    const [rows] = await dbPromise.query(sql);
    return rows;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes("doesn't exist"))) {
      return fallback;
    }
    throw e;
  }
};

// Ensure all required tables exist before dashboard queries
const ensureDashboardTables = async () => {
  const tables = [
    `CREATE TABLE IF NOT EXISTS deposits (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, amount DECIMAL(16,2) DEFAULT 0, utr VARCHAR(100), status VARCHAR(20) DEFAULT 'pending', createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS withdrawals (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, amount DECIMAL(16,2) DEFAULT 0, method VARCHAR(50), account_details TEXT, status VARCHAR(20) DEFAULT 'pending', admin_note TEXT, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS user_investments (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, plan_id INT, plan_name VARCHAR(100), amount DECIMAL(16,2) DEFAULT 0, daily_income DECIMAL(16,4) DEFAULT 0, total_income DECIMAL(16,4) DEFAULT 0, earned DECIMAL(16,4) DEFAULT 0, days_completed INT DEFAULT 0, duration INT DEFAULT 0, status VARCHAR(20) DEFAULT 'active', auto_renew TINYINT DEFAULT 0, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, lastPayoutAt TIMESTAMP NULL)`,
    `CREATE TABLE IF NOT EXISTS sell_orders (id INT AUTO_INCREMENT PRIMARY KEY, seller_id INT, buyer_id INT, amount DECIMAL(16,4) DEFAULT 0, price_per_vc DECIMAL(16,4) DEFAULT 0, total_price DECIMAL(16,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'pending', createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS level_incomes (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, from_user_id INT, investment_id INT, level INT, amount DECIMAL(16,4) DEFAULT 0, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(100) PRIMARY KEY, setting_value TEXT, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  ];
  for (const sql of tables) {
    try { await dbPromise.query(sql); } catch { /* ignored */ }
  }
};

// GET /api/admin/dashboard
exports.getDashboard = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });

    await ensureDashboardTables();

    // Total users
    const [usersRows] = await safeQuery(`SELECT COUNT(*) AS c FROM users`);
    const usersTotal = usersRows[0] || { c: 0 };

    // Today's signups
    const [usersTodayRows] = await safeQuery(`SELECT COUNT(*) AS c FROM users WHERE DATE(created_at) = CURDATE()`);
    const usersToday = usersTodayRows[0] || { c: 0 };

    // Total deposits (approved)
    const depApprovedRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM deposits WHERE status='approved'`);
    const depApproved = depApprovedRows[0] || { c: 0, total: 0 };

    // Pending deposits
    const depPendingRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM deposits WHERE status='pending'`);
    const depPending = depPendingRows[0] || { c: 0, total: 0 };

    // Total withdrawals (approved)
    const withApprovedRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE status='approved'`);
    const withApproved = withApprovedRows[0] || { c: 0, total: 0 };

    // Pending withdrawals
    const withPendingRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE status='pending'`);
    const withPending = withPendingRows[0] || { c: 0, total: 0 };

    // Active investments
    const invActiveRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM user_investments WHERE status='active'`);
    const invActive = invActiveRows[0] || { c: 0, total: 0 };

    // Total investments
    const invTotalRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM user_investments`);
    const invTotal = invTotalRows[0] || { c: 0, total: 0 };

    // Today's deposits
    const depTodayRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM deposits WHERE DATE(createdAt) = CURDATE() AND status='approved'`);
    const depToday = depTodayRows[0] || { c: 0, total: 0 };

    // Today's withdrawals
    const withTodayRows = await safeQuery(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE DATE(createdAt) = CURDATE() AND status='approved'`);
    const withToday = withTodayRows[0] || { c: 0, total: 0 };

    // Marketplace pending
    const mkPendingRows = await safeQuery(`SELECT COUNT(*) AS c FROM sell_orders WHERE status='pending'`);
    const mkPending = mkPendingRows[0] || { c: 0 };

    // Total level income
    const levelIncomeRows = await safeQuery(`SELECT COALESCE(SUM(amount),0) AS total FROM level_incomes`);
    const levelIncome = levelIncomeRows[0] || { total: 0 };

    // VC rate
    const vcRateRows = await safeQuery(`SELECT setting_value FROM app_settings WHERE setting_key = 'vc_rate' LIMIT 1`, []);
    const vcRate = vcRateRows[0] || null;

    // Recent 10 users
    const recentUsers = await safeQuery(`SELECT id, name, email, mobile, user_type, is_blocked, created_at FROM users ORDER BY created_at DESC LIMIT 10`, []);

    // Recent transactions
    const recentDeposits = await safeQuery(
      `SELECT d.id, 'deposit' AS type, u.name, d.amount, d.status, d.createdAt AS time
       FROM deposits d JOIN users u ON u.id = d.user_id
       ORDER BY d.createdAt DESC LIMIT 5`, []);
    const recentWithdrawals = await safeQuery(
      `SELECT w.id, 'withdrawal' AS type, u.name, w.amount, w.status, w.createdAt AS time
       FROM withdrawals w JOIN users u ON u.id = w.user_id
       ORDER BY w.createdAt DESC LIMIT 5`, []);
    const recentActivity = [...recentDeposits, ...recentWithdrawals]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 8);

    res.json({
      users: { total: usersTotal.c, today: usersToday.c },
      deposits: {
        approved: { count: depApproved.c, amount: Number(depApproved.total) },
        pending: { count: depPending.c, amount: Number(depPending.total) },
        today: { count: depToday.c, amount: Number(depToday.total) },
      },
      withdrawals: {
        approved: { count: withApproved.c, amount: Number(withApproved.total) },
        pending: { count: withPending.c, amount: Number(withPending.total) },
        today: { count: withToday.c, amount: Number(withToday.total) },
      },
      investments: {
        active: { count: invActive.c, amount: Number(invActive.total) },
        total: { count: invTotal.c, amount: Number(invTotal.total) },
      },
      marketplace: { pending: mkPending.c },
      levelIncome: Number(levelIncome.total),
      vcRate: Number(vcRate?.setting_value || 0),
      recentUsers,
      recentActivity,
    });
  } catch (err) {
    console.error('getDashboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
