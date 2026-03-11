const db = require('../config/db');
const dbPromise = db.promise();

const ensureWithdrawalsTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      method VARCHAR(32) DEFAULT 'upi',
      account_details TEXT NOT NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      admin_note TEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
};

const createWithdrawal = async ({ user_id, amount, method, account_details }) => {
  await ensureWithdrawalsTable();
  const [result] = await dbPromise.query(
    `INSERT INTO withdrawals (user_id, amount, method, account_details) VALUES (?, ?, ?, ?)`,
    [user_id, amount, method || 'upi', account_details]
  );
  return { id: result.insertId, user_id, amount, method, account_details, status: 'pending' };
};

const getWithdrawalsByUser = async (user_id) => {
  await ensureWithdrawalsTable();
  const [rows] = await dbPromise.query(
    `SELECT * FROM withdrawals WHERE user_id = ? ORDER BY createdAt DESC`, [user_id]
  );
  return rows;
};

const getAllWithdrawals = async () => {
  await ensureWithdrawalsTable();
  const [rows] = await dbPromise.query(
    `SELECT w.*, u.name as user_name, u.email as user_email
     FROM withdrawals w
     LEFT JOIN users u ON w.user_id = u.id
     ORDER BY w.createdAt DESC`
  );
  return rows;
};

const getWithdrawalById = async (id) => {
  const [rows] = await dbPromise.query(`SELECT * FROM withdrawals WHERE id = ? LIMIT 1`, [id]);
  return rows[0];
};

const updateWithdrawalStatus = async (id, status, admin_note) => {
  await dbPromise.query(
    `UPDATE withdrawals SET status = ?, admin_note = ? WHERE id = ?`,
    [status, admin_note || null, id]
  );
  return getWithdrawalById(id);
};

// Total approved withdrawals for a user
const getTotalWithdrawn = async (user_id) => {
  await ensureWithdrawalsTable();
  const [rows] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND status = 'approved'`,
    [user_id]
  );
  return Number(rows[0].total);
};

// Total pending withdrawals (locked)
const getPendingWithdrawals = async (user_id) => {
  await ensureWithdrawalsTable();
  const [rows] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND status = 'pending'`,
    [user_id]
  );
  return Number(rows[0].total);
};

module.exports = {
  ensureWithdrawalsTable,
  createWithdrawal,
  getWithdrawalsByUser,
  getAllWithdrawals,
  getWithdrawalById,
  updateWithdrawalStatus,
  getTotalWithdrawn,
  getPendingWithdrawals,
};
