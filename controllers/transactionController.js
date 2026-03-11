const jwt = require('jsonwebtoken');
const db = require('../config/db');
const dbPromise = db.promise();

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';

const getUserFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch {
    return null;
  }
};

// Safe query: returns empty array if table doesn't exist
const safeQuery = async (sql, params = []) => {
  try {
    const [rows] = await dbPromise.query(sql, params);
    return rows;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || (e.message && e.message.includes("doesn't exist"))) {
      return [];
    }
    throw e;
  }
};

// GET /api/transactions/my
exports.myTransactions = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });
    const uid = decoded.sub;

    const [deposits, withdrawals, investments, sentTransfers, receivedTransfers, sellOrders, buyOrders] = await Promise.all([
      safeQuery(`SELECT id, amount, status, 'deposit' AS type, method AS detail, createdAt FROM deposits WHERE user_id = ?`, [uid]),
      safeQuery(`SELECT id, amount, status, 'withdrawal' AS type, method AS detail, createdAt FROM withdrawals WHERE user_id = ?`, [uid]),
      safeQuery(`SELECT id, amount, status, 'investment' AS type, plan_name AS detail, createdAt FROM user_investments WHERE user_id = ?`, [uid]),
      safeQuery(`SELECT t.id, t.amount, 'completed' AS status, 'transfer_sent' AS type, u.name AS detail, t.createdAt FROM p2p_transfers t JOIN users u ON u.id = t.receiver_id WHERE t.sender_id = ?`, [uid]),
      safeQuery(`SELECT t.id, t.amount, 'completed' AS status, 'transfer_received' AS type, u.name AS detail, t.createdAt FROM p2p_transfers t JOIN users u ON u.id = t.sender_id WHERE t.receiver_id = ?`, [uid]),
      safeQuery("SELECT id, amount, status, 'marketplace_sell' AS type, CONCAT(price_per_vc,' \u20B9/VC') AS detail, createdAt FROM sell_orders WHERE seller_id = ?", [uid]),
      safeQuery("SELECT id, amount, status, 'marketplace_buy' AS type, CONCAT(price_per_vc,' \u20B9/VC') AS detail, createdAt FROM sell_orders WHERE buyer_id = ?", [uid]),
    ]);

    const all = [
      ...deposits,
      ...withdrawals,
      ...investments,
      ...sentTransfers,
      ...receivedTransfers,
      ...sellOrders,
      ...buyOrders,
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ transactions: all });
  } catch (err) {
    console.error('myTransactions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/transactions/all  (admin only)
exports.allTransactions = async (req, res) => {
  try {
    const decoded = getUserFromToken(req);
    if (!decoded) return res.status(401).json({ message: 'Unauthorized' });
    if (decoded.user_type !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    const [deposits, withdrawals, investments, transfers, marketplace] = await Promise.all([
      safeQuery(`SELECT d.id, d.amount, d.status, 'deposit' AS type, d.method AS detail, d.createdAt, u.name AS user_name, u.email AS user_email FROM deposits d JOIN users u ON u.id = d.user_id`),
      safeQuery(`SELECT w.id, w.amount, w.status, 'withdrawal' AS type, w.method AS detail, w.createdAt, u.name AS user_name, u.email AS user_email FROM withdrawals w JOIN users u ON u.id = w.user_id`),
      safeQuery(`SELECT i.id, i.amount, i.status, 'investment' AS type, i.plan_name AS detail, i.createdAt, u.name AS user_name, u.email AS user_email FROM user_investments i JOIN users u ON u.id = i.user_id`),
      safeQuery("SELECT t.id, t.amount, 'completed' AS status, 'transfer' AS type, CONCAT(s.name, ' \u2192 ', r.name) AS detail, t.createdAt, s.name AS user_name, s.email AS user_email FROM p2p_transfers t JOIN users s ON s.id = t.sender_id JOIN users r ON r.id = t.receiver_id"),
      safeQuery("SELECT o.id, o.amount, o.status, 'marketplace' AS type, CONCAT(o.price_per_vc,' \u20B9/VC') AS detail, o.createdAt, u.name AS user_name, u.email AS user_email FROM sell_orders o JOIN users u ON u.id = o.seller_id"),
    ]);

    const all = [
      ...deposits,
      ...withdrawals,
      ...investments,
      ...transfers,
      ...marketplace,
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ transactions: all });
  } catch (err) {
    console.error('allTransactions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
