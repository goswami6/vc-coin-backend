const db = require('../config/db');
const dbPromise = db.promise();

const ensureMarketplaceTable = async () => {
  // sell_orders table
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS sell_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      seller_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      remaining_amount DECIMAL(15,2) NOT NULL,
      price_per_vc DECIMAL(15,2) NOT NULL,
      total_price DECIMAL(15,2) NOT NULL,
      fee_percent DECIMAL(5,2) DEFAULT 5.00,
      fee_amount DECIMAL(15,2) DEFAULT 0,
      net_amount DECIMAL(15,2) DEFAULT 0,
      seller_upi VARCHAR(100) DEFAULT NULL,
      seller_qr VARCHAR(255) DEFAULT NULL,
      status ENUM('pending','approved','purchased','completed','cancelled','rejected') DEFAULT 'approved',
      buyer_id INT DEFAULT NULL,
      payment_proof VARCHAR(255) DEFAULT NULL,
      admin_note TEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // Ensure all needed columns exist (handles old schemas)
  const addCols = [
    `ALTER TABLE sell_orders ADD COLUMN remaining_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sell_orders ADD COLUMN seller_qr VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE sell_orders ADD COLUMN seller_upi VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE sell_orders ADD COLUMN payment_proof VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE sell_orders ADD COLUMN total_price DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sell_orders ADD COLUMN fee_percent DECIMAL(5,2) DEFAULT 5.00`,
    `ALTER TABLE sell_orders ADD COLUMN fee_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sell_orders ADD COLUMN net_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sell_orders ADD COLUMN admin_note TEXT DEFAULT NULL`,
    `ALTER TABLE sell_orders ADD COLUMN buyer_id INT DEFAULT NULL`,
  ];
  for (const sql of addCols) { try { await dbPromise.query(sql); } catch { } }

  try {
    await dbPromise.query(
      `ALTER TABLE sell_orders MODIFY COLUMN status ENUM('pending','approved','purchased','completed','cancelled','rejected') DEFAULT 'approved'`
    );
  } catch { }
  try { await dbPromise.query(`ALTER TABLE sell_orders CHANGE COLUMN vc_amount amount DECIMAL(15,2) NOT NULL`); } catch { }

  // Migrate old approved orders: set remaining_amount = amount where not yet set
  try {
    await dbPromise.query(
      `UPDATE sell_orders SET remaining_amount = amount WHERE (remaining_amount IS NULL OR remaining_amount = 0) AND status = 'approved' AND buyer_id IS NULL`
    );
  } catch { }

  // marketplace_purchases table for partial buys
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS marketplace_purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sell_order_id INT NOT NULL,
      buyer_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      price_per_vc DECIMAL(15,2) NOT NULL,
      total_price DECIMAL(15,2) NOT NULL,
      payment_proof VARCHAR(255) DEFAULT NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      admin_note TEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
};

// Create sell order (auto-approved)
const createSellOrder = async ({ seller_id, amount, price_per_vc, seller_upi, seller_qr }) => {
  await ensureMarketplaceTable();
  const total_price = Number(amount) * Number(price_per_vc);
  const fee_percent = 5;
  const fee_amount = (Number(amount) * fee_percent) / 100;
  const net_amount = Number(amount) - fee_amount;

  const [cols] = await dbPromise.query(`SHOW COLUMNS FROM sell_orders`);
  const colSet = new Set(cols.map(c => c.Field));

  const columns = ['seller_id', 'amount', 'price_per_vc', 'status'];
  const values = [seller_id, amount, price_per_vc, 'approved'];

  if (colSet.has('remaining_amount')) { columns.push('remaining_amount'); values.push(amount); }
  if (colSet.has('total_price')) { columns.push('total_price'); values.push(total_price); }
  if (colSet.has('fee_percent')) { columns.push('fee_percent'); values.push(fee_percent); }
  if (colSet.has('fee_amount')) { columns.push('fee_amount'); values.push(fee_amount); }
  if (colSet.has('net_amount')) { columns.push('net_amount'); values.push(net_amount); }
  if (colSet.has('seller_upi') && seller_upi) { columns.push('seller_upi'); values.push(seller_upi); }
  if (colSet.has('seller_qr') && seller_qr) { columns.push('seller_qr'); values.push(seller_qr); }

  const placeholders = columns.map(() => '?').join(', ');
  const [result] = await dbPromise.query(
    `INSERT INTO sell_orders (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return {
    id: result.insertId, seller_id, amount, remaining_amount: amount, price_per_vc,
    total_price, fee_percent, fee_amount, net_amount, seller_upi, seller_qr, status: 'approved',
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
    `SELECT s.*, u.name as seller_name, u.email as seller_email
     FROM sell_orders s
     LEFT JOIN users u ON s.seller_id = u.id
     WHERE s.seller_id = ?
     ORDER BY s.createdAt DESC`,
    [user_id]
  );
  return rows;
};

// Approved orders with remaining VC available for purchase
const getApprovedOrders = async (exclude_user_id) => {
  await ensureMarketplaceTable();
  const [cols] = await dbPromise.query(`SHOW COLUMNS FROM sell_orders`);
  const colSet = new Set(cols.map(c => c.Field));
  const remainingFilter = colSet.has('remaining_amount') ? 'AND s.remaining_amount > 0' : '';

  const [rows] = await dbPromise.query(
    `SELECT s.*, u.name as seller_name, u.email as seller_email
     FROM sell_orders s
     LEFT JOIN users u ON s.seller_id = u.id
     WHERE s.status = 'approved' AND s.seller_id != ? ${remainingFilter}
     ORDER BY s.createdAt DESC`,
    [exclude_user_id]
  );
  return rows;
};

const getAllSellOrders = async () => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT s.*, u.name as seller_name, u.email as seller_email
     FROM sell_orders s
     LEFT JOIN users u ON s.seller_id = u.id
     ORDER BY s.createdAt DESC`
  );
  return rows;
};

const updateSellOrderStatus = async (id, status, admin_note) => {
  await ensureMarketplaceTable();
  const [cols] = await dbPromise.query(`SHOW COLUMNS FROM sell_orders`);
  const colSet = new Set(cols.map(c => c.Field));
  if (colSet.has('admin_note')) {
    await dbPromise.query(
      `UPDATE sell_orders SET status = ?, admin_note = ? WHERE id = ?`,
      [status, admin_note || null, id]
    );
  } else {
    await dbPromise.query(`UPDATE sell_orders SET status = ? WHERE id = ?`, [status, id]);
  }
  return getSellOrderById(id);
};

// --- Purchases (partial buys) ---

const createPurchase = async ({ sell_order_id, buyer_id, amount, price_per_vc, payment_proof }) => {
  await ensureMarketplaceTable();
  const total_price = Number(amount) * Number(price_per_vc);

  const [result] = await dbPromise.query(
    `INSERT INTO marketplace_purchases (sell_order_id, buyer_id, amount, price_per_vc, total_price, payment_proof) VALUES (?, ?, ?, ?, ?, ?)`,
    [sell_order_id, buyer_id, amount, price_per_vc, total_price, payment_proof || null]
  );

  // Decrease remaining_amount on sell order
  await dbPromise.query(
    `UPDATE sell_orders SET remaining_amount = GREATEST(remaining_amount - ?, 0) WHERE id = ?`,
    [amount, sell_order_id]
  );

  return { id: result.insertId, sell_order_id, buyer_id, amount, price_per_vc, total_price, payment_proof, status: 'pending' };
};

const getPurchaseById = async (id) => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT p.*, s.seller_id, s.seller_upi, s.seller_qr, s.amount as order_amount, s.remaining_amount,
       u.name as buyer_name, u.email as buyer_email,
       sel.name as seller_name, sel.email as seller_email
     FROM marketplace_purchases p
     JOIN sell_orders s ON p.sell_order_id = s.id
     LEFT JOIN users u ON p.buyer_id = u.id
     LEFT JOIN users sel ON s.seller_id = sel.id
     WHERE p.id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
};

const getPurchasesBySellOrder = async (sell_order_id) => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT p.*, u.name as buyer_name, u.email as buyer_email
     FROM marketplace_purchases p
     LEFT JOIN users u ON p.buyer_id = u.id
     WHERE p.sell_order_id = ?
     ORDER BY p.createdAt DESC`,
    [sell_order_id]
  );
  return rows;
};

const getPurchasesByBuyer = async (buyer_id) => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT p.*, s.seller_id, s.amount as order_amount, s.price_per_vc as order_price_per_vc,
       s.seller_upi, s.seller_qr,
       sel.name as seller_name, sel.email as seller_email
     FROM marketplace_purchases p
     JOIN sell_orders s ON p.sell_order_id = s.id
     LEFT JOIN users sel ON s.seller_id = sel.id
     WHERE p.buyer_id = ?
     ORDER BY p.createdAt DESC`,
    [buyer_id]
  );
  return rows;
};

const getAllPurchases = async () => {
  await ensureMarketplaceTable();
  const [rows] = await dbPromise.query(
    `SELECT p.*, s.seller_id, s.amount as order_amount, s.seller_upi, s.seller_qr,
       u.name as buyer_name, u.email as buyer_email,
       sel.name as seller_name, sel.email as seller_email
     FROM marketplace_purchases p
     JOIN sell_orders s ON p.sell_order_id = s.id
     LEFT JOIN users u ON p.buyer_id = u.id
     LEFT JOIN users sel ON s.seller_id = sel.id
     ORDER BY p.createdAt DESC`
  );
  return rows;
};

const updatePurchaseStatus = async (id, status, admin_note) => {
  await dbPromise.query(
    `UPDATE marketplace_purchases SET status = ?, admin_note = ? WHERE id = ?`,
    [status, admin_note || null, id]
  );
  return getPurchaseById(id);
};

// Restore remaining_amount when a purchase is rejected
const restoreSellOrderAmount = async (sell_order_id, amount) => {
  await dbPromise.query(
    `UPDATE sell_orders SET remaining_amount = remaining_amount + ?, status = 'approved' WHERE id = ?`,
    [amount, sell_order_id]
  );
};

// Auto-complete sell order if remaining=0 and no pending purchases
const checkAndCompleteSellOrder = async (sell_order_id) => {
  const [order] = await dbPromise.query(`SELECT remaining_amount FROM sell_orders WHERE id = ?`, [sell_order_id]);
  if (!order[0] || Number(order[0].remaining_amount) > 0) return;
  const [pending] = await dbPromise.query(
    `SELECT COUNT(*) as cnt FROM marketplace_purchases WHERE sell_order_id = ? AND status = 'pending'`,
    [sell_order_id]
  );
  if (pending[0].cnt === 0) {
    await dbPromise.query(`UPDATE sell_orders SET status = 'completed' WHERE id = ? AND status = 'approved'`, [sell_order_id]);
  }
};

// Get total VC locked for a seller (remaining in active orders + pending purchase amounts)
const getLockedBalance = async (user_id) => {
  await ensureMarketplaceTable();

  let remaining = 0;
  try {
    const [cols] = await dbPromise.query(`SHOW COLUMNS FROM sell_orders`);
    const colSet = new Set(cols.map(c => c.Field));
    if (colSet.has('remaining_amount')) {
      const [rows] = await dbPromise.query(
        `SELECT COALESCE(SUM(remaining_amount), 0) as total FROM sell_orders WHERE seller_id = ? AND status = 'approved'`,
        [user_id]
      );
      remaining = Number(rows[0].total);
    } else {
      const amountCol = colSet.has('amount') ? 'amount' : 'vc_amount';
      const [rows] = await dbPromise.query(
        `SELECT COALESCE(SUM(${amountCol}), 0) as total FROM sell_orders WHERE seller_id = ? AND status IN ('pending','approved','purchased')`,
        [user_id]
      );
      remaining = Number(rows[0].total);
    }
  } catch { }

  let pendingPurchases = 0;
  try {
    const [rows] = await dbPromise.query(
      `SELECT COALESCE(SUM(p.amount), 0) as total
       FROM marketplace_purchases p
       JOIN sell_orders s ON p.sell_order_id = s.id
       WHERE s.seller_id = ? AND p.status = 'pending'`,
      [user_id]
    );
    pendingPurchases = Number(rows[0].total);
  } catch { }

  return remaining + pendingPurchases;
};

module.exports = {
  ensureMarketplaceTable,
  createSellOrder,
  getSellOrderById,
  getSellOrdersByUser,
  getApprovedOrders,
  getAllSellOrders,
  updateSellOrderStatus,
  createPurchase,
  getPurchaseById,
  getPurchasesBySellOrder,
  getPurchasesByBuyer,
  getAllPurchases,
  updatePurchaseStatus,
  restoreSellOrderAmount,
  checkAndCompleteSellOrder,
  getLockedBalance,
};
