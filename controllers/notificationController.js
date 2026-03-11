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

// GET /api/admin/notifications
exports.getNotifications = async (req, res) => {
  try {
    if (!getAdmin(req)) return res.status(403).json({ message: 'Admin only' });

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    // Gather recent activities from all tables
    const [deposits] = await dbPromise.query(
      `SELECT d.id, 'deposit' AS type, u.name, d.amount, d.status, d.createdAt AS time
       FROM deposits d JOIN users u ON u.id = d.user_id
       ORDER BY d.createdAt DESC LIMIT ?`, [limit]
    );

    const [withdrawals] = await dbPromise.query(
      `SELECT w.id, 'withdrawal' AS type, u.name, w.amount, w.status, w.createdAt AS time
       FROM withdrawals w JOIN users u ON u.id = w.user_id
       ORDER BY w.createdAt DESC LIMIT ?`, [limit]
    );

    const [investments] = await dbPromise.query(
      `SELECT i.id, 'investment' AS type, u.name, i.amount, i.plan_name, i.status, i.createdAt AS time
       FROM user_investments i JOIN users u ON u.id = i.user_id
       ORDER BY i.createdAt DESC LIMIT ?`, [limit]
    );

    const [registrations] = await dbPromise.query(
      `SELECT id, 'registration' AS type, name, email, created_at AS time
       FROM users ORDER BY created_at DESC LIMIT ?`, [limit]
    );

    const [transfers] = await dbPromise.query(
      `SELECT t.id, 'transfer' AS type, s.name AS sender_name, r.name AS receiver_name, t.amount, t.createdAt AS time
       FROM p2p_transfers t JOIN users s ON s.id = t.sender_id JOIN users r ON r.id = t.receiver_id
       ORDER BY t.createdAt DESC LIMIT ?`, [limit]
    );

    const [marketplace] = await dbPromise.query(
      `SELECT o.id, 'marketplace' AS type, s.name AS seller_name, b.name AS buyer_name, o.total_price AS amount, o.status, o.createdAt AS time
       FROM sell_orders o JOIN users s ON s.id = o.seller_id LEFT JOIN users b ON b.id = o.buyer_id
       ORDER BY o.createdAt DESC LIMIT ?`, [limit]
    );

    // Merge & sort by time desc
    const all = [...deposits, ...withdrawals, ...investments, ...registrations, ...transfers, ...marketplace]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, limit);

    // Pending counts
    const [[depPending]] = await dbPromise.query(`SELECT COUNT(*) AS c FROM deposits WHERE status='pending'`);
    const [[withPending]] = await dbPromise.query(`SELECT COUNT(*) AS c FROM withdrawals WHERE status='pending'`);
    const [[mkPending]] = await dbPromise.query(`SELECT COUNT(*) AS c FROM sell_orders WHERE status='pending'`);

    res.json({
      notifications: all,
      pending: {
        deposits: depPending.c,
        withdrawals: withPending.c,
        marketplace: mkPending.c,
      },
    });
  } catch (err) {
    console.error('getNotifications error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
