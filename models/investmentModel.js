const db = require('../config/db');
const dbPromise = db.promise();

const ensureInvestmentsTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS user_investments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_id INT NOT NULL,
      plan_name VARCHAR(255),
      amount DECIMAL(15,2) NOT NULL,
      daily_roi DECIMAL(8,4) NOT NULL,
      tenure_days INT NOT NULL,
      total_return DECIMAL(15,2) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status ENUM('active','completed','cancelled') DEFAULT 'active',
      auto_renew TINYINT(1) DEFAULT 1,
      renewal_count INT DEFAULT 0,
      original_investment_id INT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
  // Add columns if missing (for existing tables)
  const cols = ['auto_renew', 'renewal_count', 'original_investment_id'];
  const defaults = ["TINYINT(1) DEFAULT 1", "INT DEFAULT 0", "INT DEFAULT NULL"];
  for (let i = 0; i < cols.length; i++) {
    try {
      await dbPromise.query(`ALTER TABLE user_investments ADD COLUMN ${cols[i]} ${defaults[i]}`);
    } catch { /* column already exists */ }
  }
};

const createInvestment = async ({ user_id, plan_id, plan_name, amount, daily_roi, tenure_days, total_return }) => {
  await ensureInvestmentsTable();
  const start_date = new Date();
  const end_date = new Date();
  end_date.setDate(end_date.getDate() + tenure_days);

  const [result] = await dbPromise.query(
    `INSERT INTO user_investments (user_id, plan_id, plan_name, amount, daily_roi, tenure_days, total_return, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user_id, plan_id, plan_name, amount, daily_roi, tenure_days, total_return,
      start_date.toISOString().split('T')[0], end_date.toISOString().split('T')[0]]
  );
  return {
    id: result.insertId, user_id, plan_id, plan_name, amount, daily_roi,
    tenure_days, total_return, start_date, end_date, status: 'active',
  };
};

const getInvestmentsByUser = async (user_id) => {
  await ensureInvestmentsTable();
  const [rows] = await dbPromise.query(
    `SELECT ui.*, ip.image as plan_image
     FROM user_investments ui
     LEFT JOIN investment_plans ip ON ui.plan_id = ip.id
     WHERE ui.user_id = ? ORDER BY ui.createdAt DESC`,
    [user_id]
  );
  return rows;
};

const getAllInvestments = async () => {
  await ensureInvestmentsTable();
  const [rows] = await dbPromise.query(
    `SELECT ui.*, u.name as user_name, u.email as user_email
     FROM user_investments ui
     LEFT JOIN users u ON ui.user_id = u.id
     ORDER BY ui.createdAt DESC`
  );
  return rows;
};

const getInvestmentStats = async (user_id) => {
  await ensureInvestmentsTable();
  const [active] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM user_investments WHERE user_id = ? AND status = 'active'`,
    [user_id]
  );
  const [all] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM user_investments WHERE user_id = ?`,
    [user_id]
  );
  return {
    activeInvested: Number(active[0].total),
    activeCount: active[0].count,
    totalInvested: Number(all[0].total),
    totalCount: all[0].count,
  };
};

// Auto-complete investments whose end_date has passed
const completeExpiredInvestments = async () => {
  await ensureInvestmentsTable();
  const today = new Date().toISOString().split('T')[0];
  const [expired] = await dbPromise.query(
    `SELECT * FROM user_investments WHERE status = 'active' AND end_date <= ?`,
    [today]
  );
  if (expired.length === 0) return [];

  // Mark them completed
  await dbPromise.query(
    `UPDATE user_investments SET status = 'completed' WHERE status = 'active' AND end_date <= ?`,
    [today]
  );

  return expired;
};

// Auto-renew completed investments that have auto_renew = 1
const autoRenewInvestments = async () => {
  await ensureInvestmentsTable();
  const expired = await completeExpiredInvestments();
  const renewed = [];

  for (const inv of expired) {
    if (!inv.auto_renew) continue;

    const start_date = new Date();
    const end_date = new Date();
    end_date.setDate(end_date.getDate() + inv.tenure_days);

    const originalId = inv.original_investment_id || inv.id;
    const newCount = (inv.renewal_count || 0) + 1;

    const [result] = await dbPromise.query(
      `INSERT INTO user_investments (user_id, plan_id, plan_name, amount, daily_roi, tenure_days, total_return, start_date, end_date, auto_renew, renewal_count, original_investment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [inv.user_id, inv.plan_id, inv.plan_name, inv.amount, inv.daily_roi,
      inv.tenure_days, inv.total_return,
      start_date.toISOString().split('T')[0], end_date.toISOString().split('T')[0],
        newCount, originalId]
    );

    renewed.push({
      id: result.insertId,
      user_id: inv.user_id,
      amount: Number(inv.amount),
      plan_name: inv.plan_name,
      renewal_count: newCount,
      original_investment_id: originalId,
    });
  }

  return renewed;
};

// Toggle auto_renew for a specific investment
const toggleAutoRenew = async (id, user_id) => {
  const [rows] = await dbPromise.query(
    `SELECT * FROM user_investments WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, user_id]
  );
  if (!rows[0]) return null;
  const newVal = rows[0].auto_renew ? 0 : 1;
  await dbPromise.query(`UPDATE user_investments SET auto_renew = ? WHERE id = ?`, [newVal, id]);
  return { ...rows[0], auto_renew: newVal };
};

const cancelInvestment = async (id) => {
  const [rows] = await dbPromise.query(`SELECT * FROM user_investments WHERE id = ? LIMIT 1`, [id]);
  if (!rows[0]) return null;
  if (rows[0].status !== 'active') return { error: 'Only active investments can be cancelled.' };
  await dbPromise.query(`UPDATE user_investments SET status = 'cancelled' WHERE id = ?`, [id]);
  const [updated] = await dbPromise.query(`SELECT * FROM user_investments WHERE id = ? LIMIT 1`, [id]);
  return updated[0];
};

module.exports = {
  ensureInvestmentsTable,
  createInvestment,
  getInvestmentsByUser,
  getAllInvestments,
  getInvestmentStats,
  completeExpiredInvestments,
  autoRenewInvestments,
  toggleAutoRenew,
  cancelInvestment,
};
