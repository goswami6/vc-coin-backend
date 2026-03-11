const db = require('../config/db');
const dbPromise = db.promise();

const ensureDepositsTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS deposits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      method VARCHAR(32) DEFAULT 'upi',
      txn_id VARCHAR(255),
      screenshot VARCHAR(512) DEFAULT NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      admin_note TEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
};

const createDeposit = async ({ user_id, amount, method, txn_id, screenshot }) => {
  await ensureDepositsTable();
  const [result] = await dbPromise.query(
    `INSERT INTO deposits (user_id, amount, method, txn_id, screenshot) VALUES (?, ?, ?, ?, ?)`,
    [user_id, amount, method || 'upi', txn_id, screenshot || null]
  );
  return { id: result.insertId, user_id, amount, method, txn_id, status: 'pending' };
};

const getDepositsByUser = async (user_id) => {
  await ensureDepositsTable();
  const [rows] = await dbPromise.query(
    `SELECT * FROM deposits WHERE user_id = ? ORDER BY createdAt DESC`, [user_id]
  );
  return rows;
};

const getAllDeposits = async () => {
  await ensureDepositsTable();
  const [rows] = await dbPromise.query(
    `SELECT d.*, u.name as user_name, u.email as user_email FROM deposits d LEFT JOIN users u ON d.user_id = u.id ORDER BY d.createdAt DESC`
  );
  return rows;
};

const getDepositById = async (id) => {
  const [rows] = await dbPromise.query(`SELECT * FROM deposits WHERE id = ? LIMIT 1`, [id]);
  return rows[0];
};

const updateDepositStatus = async (id, status, admin_note) => {
  await dbPromise.query(
    `UPDATE deposits SET status = ?, admin_note = ? WHERE id = ?`,
    [status, admin_note || null, id]
  );
  return getDepositById(id);
};

// Wallet balance = sum of approved deposits - sum of investments + net transfers
const getWalletBalance = async (user_id) => {
  await ensureDepositsTable();
  const [dep] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE user_id = ? AND status = 'approved'`,
    [user_id]
  );

  // Check if investments table exists
  let invested = 0;
  try {
    const [inv] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM user_investments WHERE user_id = ? AND status IN ('active','completed')`,
      [user_id]
    );
    invested = Number(inv[0].total);
  } catch {
    // table doesn't exist yet
  }

  // Check P2P transfers
  let transferNet = 0;
  try {
    const [sent] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM p2p_transfers WHERE sender_id = ?`, [user_id]
    );
    const [received] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM p2p_transfers WHERE receiver_id = ?`, [user_id]
    );
    transferNet = Number(received[0].total) - Number(sent[0].total);
  } catch {
    // table doesn't exist yet
  }

  // Check marketplace sell fee deductions (completed orders where this user is seller)
  let sellFees = 0;
  try {
    const [fees] = await dbPromise.query(
      `SELECT COALESCE(SUM(fee_amount), 0) as total FROM sell_orders WHERE seller_id = ? AND status = 'completed'`,
      [user_id]
    );
    sellFees = Number(fees[0].total);
  } catch {
    // table doesn't exist yet
  }

  // Check approved withdrawals
  let withdrawn = 0;
  try {
    const [w] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND status = 'approved'`,
      [user_id]
    );
    withdrawn = Number(w[0].total);
  } catch {
    // table doesn't exist yet
  }

  // Level income earned from referrals
  let levelIncome = 0;
  try {
    const [li] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM level_incomes WHERE user_id = ?`,
      [user_id]
    );
    levelIncome = Number(li[0].total);
  } catch {
    // table doesn't exist yet
  }

  return Number(dep[0].total) - invested + transferNet - sellFees - withdrawn + levelIncome;
};

// Available balance (wallet - locked marketplace orders - pending withdrawals)
const getAvailableBalance = async (user_id) => {
  const wallet = await getWalletBalance(user_id);

  let marketLocked = 0;
  try {
    const [rows] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount + fee_amount), 0) as total FROM sell_orders WHERE seller_id = ? AND status IN ('pending','approved','purchased')`,
      [user_id]
    );
    marketLocked = Number(rows[0].total);
  } catch { }

  let pendingWithdrawals = 0;
  try {
    const [rows] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND status = 'pending'`,
      [user_id]
    );
    pendingWithdrawals = Number(rows[0].total);
  } catch { }

  // Approved withdrawals deducted from wallet
  let approvedWithdrawals = 0;
  try {
    const [rows] = await dbPromise.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND status = 'approved'`,
      [user_id]
    );
    approvedWithdrawals = Number(rows[0].total);
  } catch { }

  return {
    wallet: wallet - approvedWithdrawals,
    available: wallet - approvedWithdrawals - marketLocked - pendingWithdrawals,
    marketLocked,
    pendingWithdrawals,
    approvedWithdrawals,
  };
};

const getDepositStats = async (user_id) => {
  await ensureDepositsTable();
  const [total] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM deposits WHERE user_id = ? AND status = 'approved'`,
    [user_id]
  );
  const [pending] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM deposits WHERE user_id = ? AND status = 'pending'`,
    [user_id]
  );
  return {
    totalDeposited: Number(total[0].total),
    totalCount: total[0].count,
    pendingAmount: Number(pending[0].total),
    pendingCount: pending[0].count,
  };
};

// INR balance from completed sell orders (seller gets total_price in ₹)
const getInrBalance = async (user_id) => {
  // Earned from selling VC coins
  let earned = 0;
  try {
    const [rows] = await dbPromise.query(
      `SELECT COALESCE(SUM(total_price), 0) as total FROM sell_orders WHERE seller_id = ? AND status = 'completed'`,
      [user_id]
    );
    earned = Number(rows[0].total);
  } catch { }

  // Spent buying VC coins from marketplace
  let spent = 0;
  try {
    const [rows] = await dbPromise.query(
      `SELECT COALESCE(SUM(total_price), 0) as total FROM sell_orders WHERE buyer_id = ? AND status = 'completed'`,
      [user_id]
    );
    spent = Number(rows[0].total);
  } catch { }

  return { earned, spent, net: earned - spent };
};

module.exports = {
  createDeposit,
  getDepositsByUser,
  getAllDeposits,
  getDepositById,
  updateDepositStatus,
  getWalletBalance,
  getAvailableBalance,
  getDepositStats,
  getInrBalance,
};
