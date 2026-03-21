const db = require('../config/db');
const dbPromise = db.promise();

const ensureRoiTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS roi_distributions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      investment_id INT NOT NULL,
      amount DECIMAL(15,6) NOT NULL,
      distribution_date DATE NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_daily (investment_id, distribution_date)
    ) ENGINE=InnoDB;
  `);
  // Track maturity returns separately
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS maturity_returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      investment_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_maturity (investment_id)
    ) ENGINE=InnoDB;
  `);
};

// Distribute daily ROI for all active investments
const distributeDailyRoi = async () => {
  await ensureRoiTable();
  const today = new Date().toISOString().split('T')[0];

  // Get active investments that haven't been paid today
  const [investments] = await dbPromise.query(
    `SELECT ui.id, ui.user_id, ui.amount, ui.daily_roi, ui.start_date, ui.end_date
     FROM user_investments ui
     WHERE ui.status = 'active'
       AND ui.start_date <= ?
       AND ui.end_date > ?
       AND ui.id NOT IN (
         SELECT investment_id FROM roi_distributions WHERE distribution_date = ?
       )`,
    [today, today, today]
  );

  if (investments.length === 0) return [];

  const distributed = [];
  for (const inv of investments) {
    const dailyAmount = (Number(inv.amount) * Number(inv.daily_roi)) / 100;
    if (dailyAmount <= 0) continue;

    try {
      await dbPromise.query(
        `INSERT INTO roi_distributions (user_id, investment_id, amount, distribution_date)
         VALUES (?, ?, ?, ?)`,
        [inv.user_id, inv.id, dailyAmount, today]
      );
      distributed.push({
        user_id: inv.user_id,
        investment_id: inv.id,
        amount: dailyAmount,
      });
    } catch (err) {
      // Duplicate key = already distributed today, skip
      if (err.code !== 'ER_DUP_ENTRY') {
        console.error(`ROI distribution error for investment ${inv.id}:`, err.message);
      }
    }
  }

  return distributed;
};

// Credit maturity return (invested amount back to wallet) when investment completes
const creditMaturityReturn = async (investment) => {
  await ensureRoiTable();
  try {
    await dbPromise.query(
      `INSERT INTO maturity_returns (user_id, investment_id, amount)
       VALUES (?, ?, ?)`,
      [investment.user_id, investment.id, investment.amount]
    );
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return false; // Already credited
    throw err;
  }
};

// Get total ROI earned by a user (used in wallet balance calc)
const getTotalRoiByUser = async (user_id) => {
  await ensureRoiTable();
  const [rows] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM roi_distributions WHERE user_id = ?`,
    [user_id]
  );
  return Number(rows[0].total);
};

// Get total maturity returns by a user (used in wallet balance calc)
const getTotalMaturityByUser = async (user_id) => {
  await ensureRoiTable();
  const [rows] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM maturity_returns WHERE user_id = ?`,
    [user_id]
  );
  return Number(rows[0].total);
};

module.exports = {
  ensureRoiTable,
  distributeDailyRoi,
  creditMaturityReturn,
  getTotalRoiByUser,
  getTotalMaturityByUser,
};
