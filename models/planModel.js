const db = require('../config/db');

const dbPromise = db.promise();

const ensurePlansTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS investment_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      image VARCHAR(512) DEFAULT NULL,
      investment_amount DECIMAL(15,2) NOT NULL,
      daily_roi DECIMAL(8,4) NOT NULL,
      tenure_days INT NOT NULL,
      total_return DECIMAL(15,2) NOT NULL,
      status ENUM('active','inactive') DEFAULT 'active',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
};

const createPlan = async (data) => {
  await ensurePlansTable();
  const { name, image, investment_amount, daily_roi, tenure_days, total_return } = data;
  const [result] = await dbPromise.query(
    `INSERT INTO investment_plans (name, image, investment_amount, daily_roi, tenure_days, total_return) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, image || null, investment_amount, daily_roi, tenure_days, total_return]
  );
  return { id: result.insertId, ...data };
};

const getAllPlans = async () => {
  await ensurePlansTable();
  const [rows] = await dbPromise.query(`SELECT * FROM investment_plans ORDER BY createdAt DESC`);
  return rows;
};

const getActivePlans = async () => {
  await ensurePlansTable();
  const [rows] = await dbPromise.query(`SELECT * FROM investment_plans WHERE status = 'active' ORDER BY createdAt DESC`);
  return rows;
};

const getPlanById = async (id) => {
  const [rows] = await dbPromise.query(`SELECT * FROM investment_plans WHERE id = ? LIMIT 1`, [id]);
  return rows[0];
};

const updatePlan = async (id, data) => {
  const { name, image, investment_amount, daily_roi, tenure_days, total_return, status } = data;
  await dbPromise.query(
    `UPDATE investment_plans SET name=?, image=COALESCE(?, image), investment_amount=?, daily_roi=?, tenure_days=?, total_return=?, status=? WHERE id=?`,
    [name, image || null, investment_amount, daily_roi, tenure_days, total_return, status || 'active', id]
  );
  return getPlanById(id);
};

const deletePlan = async (id) => {
  await dbPromise.query(`DELETE FROM investment_plans WHERE id = ?`, [id]);
};

module.exports = {
  createPlan,
  getAllPlans,
  getActivePlans,
  getPlanById,
  updatePlan,
  deletePlan,
};
