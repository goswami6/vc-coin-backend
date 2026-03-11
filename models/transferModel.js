const db = require('../config/db');
const dbPromise = db.promise();

const ensureTransfersTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS p2p_transfers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      note VARCHAR(255) DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
};

const createTransfer = async ({ sender_id, receiver_id, amount, note }) => {
  await ensureTransfersTable();
  const [result] = await dbPromise.query(
    `INSERT INTO p2p_transfers (sender_id, receiver_id, amount, note) VALUES (?, ?, ?, ?)`,
    [sender_id, receiver_id, amount, note || null]
  );
  return { id: result.insertId, sender_id, receiver_id, amount, note };
};

const getTransfersByUser = async (user_id) => {
  await ensureTransfersTable();
  const [rows] = await dbPromise.query(
    `SELECT t.*,
       s.name as sender_name, s.email as sender_email,
       r.name as receiver_name, r.email as receiver_email
     FROM p2p_transfers t
     LEFT JOIN users s ON t.sender_id = s.id
     LEFT JOIN users r ON t.receiver_id = r.id
     WHERE t.sender_id = ? OR t.receiver_id = ?
     ORDER BY t.createdAt DESC`,
    [user_id, user_id]
  );
  return rows;
};

// Net transfer balance for a user (received - sent)
const getTransferBalance = async (user_id) => {
  await ensureTransfersTable();
  const [sent] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM p2p_transfers WHERE sender_id = ?`,
    [user_id]
  );
  const [received] = await dbPromise.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM p2p_transfers WHERE receiver_id = ?`,
    [user_id]
  );
  return Number(received[0].total) - Number(sent[0].total);
};

const getAllTransfers = async () => {
  await ensureTransfersTable();
  const [rows] = await dbPromise.query(
    `SELECT t.*,
       s.name as sender_name, s.email as sender_email,
       r.name as receiver_name, r.email as receiver_email
     FROM p2p_transfers t
     LEFT JOIN users s ON t.sender_id = s.id
     LEFT JOIN users r ON t.receiver_id = r.id
     ORDER BY t.createdAt DESC`
  );
  return rows;
};

module.exports = {
  ensureTransfersTable,
  createTransfer,
  getTransfersByUser,
  getTransferBalance,
  getAllTransfers,
};
