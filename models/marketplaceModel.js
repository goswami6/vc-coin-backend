const db = require('../config/db');
const dbPromise = db.promise();

const ensureMarketplaceTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS sell_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      seller_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      price_per_vc DECIMAL(15,2) NOT NULL,
      total_price DECIMAL(15,2) NOT NULL,
      fee_percent DECIMAL(5,2) DEFAULT 5.00,
      fee_amount DECIMAL(15,2) DEFAULT 0,
      net_amount DECIMAL(15,2) DEFAULT 0,
      status ENUM('pending','approved','purchased','completed','cancelled','rejected') DEFAULT 'pending',
      buyer_id INT DEFAULT NULL,
      admin_note TEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
  // Ensure 'purchased' status exists for older tables
  try {
    await dbPromise.query(
      `ALTER TABLE sell_orders MODIFY COLUMN status ENUM('pending','approved','purchased','completed','cancelled','rejected') DEFAULT 'pending'`
    );
  } catch { }
  // Ensure seller_upi column exists
  try {
    await dbPromise.query(
      `ALTER TABLE sell_orders ADD COLUMN seller_upi VARCHAR(100) DEFAULT NULL`
    );
  } catch { }
  // Ensure payment_proof column exists
  try {
    await dbPromise.query(
      `ALTER TABLE sell_orders ADD COLUMN payment_proof VARCHAR(255) DEFAULT NULL`
    );
  } catch { }
  // Rename vc_amount → amount if old schema
  try {
    await dbPromise.query(
      `ALTER TABLE sell_orders CHANGE COLUMN vc_amount amount DECIMAL(15,2) NOT NULL`
    );
  } catch { }
};

const createSellOrder = async ({ seller_id, amount, price_per_vc, seller_upi }) => {
  await ensureMarketplaceTable();
  const total_price = Number(amount) * Number(price_per_vc);
  const fee_percent = 5;
  const fee_amount = (Number(amount) * fee_percent) / 100;
  const net_amount = Number(amount) - fee_amount;

  const [result] = await dbPromise.query(
    `INSERT INTO sell_orders (seller_id, amount, price_per_vc, total_price, fee_percent, fee_amount, net_amount, seller_upi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [seller_id, amount, price_per_vc, total_price, fee_percent, fee_amount, net_amount, seller_upi]
  );
  return {
    id: result.insertId, seller_id, amount, price_per_vc,
    total_price, fee_percent, fee_amount, net_amount, seller_upi, status: 'pending',
  };
};

const getSellOrderById = async (id) => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(`SELECT * FROM sell_orders WHERE id = ? LIMIT 1`, [id]);
  return rows[0];
};

const getSellOrdersByUser = async (user_id) => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT s.*, u.name as seller_name, u.email as seller_email,
       b.name as buyer_name, b.email as buyer_email
     FROM sell_orders s
     LEFT JOIN users u ON s.seller_id = u.id
     LEFT JOIN users b ON s.buyer_id = b.id
     WHERE s.seller_id = ?
     ORDER BY s.createdAt DESC`,
    [user_id]
  );
  return rows;
};

// Approved orders available for purchase (exclude own orders)
const getApprovedOrders = async (exclude_user_id) => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT s.*, u.name as seller_name, u.email as seller_email
     FROM sell_orders s
     LEFT JOIN users u ON s.seller_id = u.id
     WHERE s.status = 'approved' AND s.seller_id != ?
     ORDER BY s.createdAt DESC`,
    [exclude_user_id]
  );
  return rows;
};

const getAllSellOrders = async () => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT s.*, u.name as seller_name, u.email as seller_email,
       b.name as buyer_name, b.email as buyer_email
     FROM sell_orders s
     LEFT JOIN users u ON s.seller_id = u.id
     LEFT JOIN users b ON s.buyer_id = b.id
     ORDER BY s.createdAt DESC`
  );
  return rows;
};

const updateSellOrderStatus = async (id, status, admin_note) => {
  await dbPromise.query(
    `UPDATE sell_orders SET status = ?, admin_note = ? WHERE id = ?`,
    [status, admin_note || null, id]
  );
  return getSellOrderById(id);
};

const completeSellOrder = async (id, buyer_id) => {
  await dbPromise.query(
    `UPDATE sell_orders SET status = 'completed', buyer_id = ? WHERE id = ?`,
    [buyer_id, id]
  );
  return getSellOrderById(id);
};

const claimSellOrder = async (id, buyer_id, payment_proof) => {
  await dbPromise.query(
    `UPDATE sell_orders SET status = 'purchased', buyer_id = ?, payment_proof = ? WHERE id = ?`,
    [buyer_id, payment_proof || null, id]
  );
  return getSellOrderById(id);
};

// Get total VC locked in pending/approved sell orders for a user (includes fee)
const getLockedBalance = async (user_id) => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount + fee_amount), 0) as total FROM sell_orders WHERE seller_id = ? AND status IN ('pending','approved','purchased')`,
    [user_id]
  );
  return Number(rows[0].total);
};

module.exports = {
  ensureMarketplaceTable,
  createSellOrder,
  getSellOrderById,
  getSellOrdersByUser,
  getApprovedOrders,
  getAllSellOrders,
  updateSellOrderStatus,
  completeSellOrder,
  claimSellOrder,
  getLockedBalance,
};
