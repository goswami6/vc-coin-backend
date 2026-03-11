const db = require('../config/db');
const dbPromise = db.promise();

const LEVEL_PERCENTAGES = [5, 2, 1, 1, 0.5, 0.5]; // 6 levels

const ensureLevelIncomeTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS level_incomes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      from_user_id INT NOT NULL,
      investment_id INT NOT NULL,
      level INT NOT NULL,
      percentage DECIMAL(5,2) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
};

// Credit level income to upline when an investment is made
const creditLevelIncome = async (investorId, investmentAmount, investmentId) => {
  await ensureLevelIncomeTable();
  const { getUplineChain } = require('./userModel');
  const chain = await getUplineChain(investorId, 6);

  for (const upline of chain) {
    const pct = LEVEL_PERCENTAGES[upline.level - 1];
    if (!pct) continue;
    const income = (investmentAmount * pct) / 100;
    await dbPromise.query(
      `INSERT INTO level_incomes (user_id, from_user_id, investment_id, level, percentage, amount) VALUES (?, ?, ?, ?, ?, ?)`,
      [upline.user_id, investorId, investmentId, upline.level, pct, income]
    );
  }
};

// Get level incomes received by a user
const getLevelIncomesByUser = async (userId) => {
  await ensureLevelIncomeTable();
  const [rows] = await dbPromise.query(
    `SELECT li.*, u.name AS from_name, u.email AS from_email
     FROM level_incomes li
     JOIN users u ON u.id = li.from_user_id
     WHERE li.user_id = ?
     ORDER BY li.createdAt DESC`,
    [userId]
  );
  return rows;
};

// Get level income stats for a user
const getLevelIncomeStats = async (userId) => {
  await ensureLevelIncomeTable();
  const [rows] = await dbPromise.query(
    `SELECT level, SUM(amount) AS total, COUNT(*) AS count
     FROM level_incomes WHERE user_id = ?
     GROUP BY level ORDER BY level`,
    [userId]
  );
  const [totalRow] = await dbPromise.query(
    'SELECT COALESCE(SUM(amount),0) AS grand_total FROM level_incomes WHERE user_id = ?',
    [userId]
  );
  return { byLevel: rows, totalIncome: Number(totalRow[0].grand_total) };
};

// Get all level incomes (admin)
const getAllLevelIncomes = async () => {
  await ensureLevelIncomeTable();
  const [rows] = await dbPromise.query(
    `SELECT li.*, u.name AS earner_name, u.email AS earner_email, f.name AS from_name, f.email AS from_email
     FROM level_incomes li
     JOIN users u ON u.id = li.user_id
     JOIN users f ON f.id = li.from_user_id
     ORDER BY li.createdAt DESC`
  );
  return rows;
};

module.exports = {
  LEVEL_PERCENTAGES,
  ensureLevelIncomeTable,
  creditLevelIncome,
  getLevelIncomesByUser,
  getLevelIncomeStats,
  getAllLevelIncomes,
};
