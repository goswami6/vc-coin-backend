const db = require('../config/db');
const dbPromise = db.promise();

const ensureSupportTables = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      subject VARCHAR(255) NOT NULL,
      status ENUM('open','resolved','closed') DEFAULT 'open',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id INT NOT NULL,
      sender_role ENUM('user','admin') NOT NULL,
      sender_id INT NOT NULL,
      message TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
};

const createTicket = async (user_id, subject, message) => {
  await ensureSupportTables();
  const [result] = await dbPromise.query(
    `INSERT INTO support_tickets (user_id, subject) VALUES (?, ?)`,
    [user_id, subject]
  );
  const ticket_id = result.insertId;
  await dbPromise.query(
    `INSERT INTO support_messages (ticket_id, sender_role, sender_id, message) VALUES (?, 'user', ?, ?)`,
    [ticket_id, user_id, message]
  );
  return { id: ticket_id, user_id, subject, status: 'open' };
};

const getTicketsByUser = async (user_id) => {
  await ensureSupportTables();
  const [rows] = await dbPromise.query(
    `SELECT t.*, 
       (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_role = 'admin' 
        AND m.createdAt > COALESCE((SELECT MAX(m2.createdAt) FROM support_messages m2 WHERE m2.ticket_id = t.id AND m2.sender_role = 'user'), t.createdAt)) as unread_count
     FROM support_tickets t 
     WHERE t.user_id = ? 
     ORDER BY t.updatedAt DESC`,
    [user_id]
  );
  return rows;
};

const getAllTickets = async () => {
  await ensureSupportTables();
  const [rows] = await dbPromise.query(
    `SELECT t.*, u.name as user_name, u.email as user_email,
       (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_role = 'user' 
        AND m.createdAt > COALESCE((SELECT MAX(m2.createdAt) FROM support_messages m2 WHERE m2.ticket_id = t.id AND m2.sender_role = 'admin'), t.createdAt)) as unread_count,
       (SELECT message FROM support_messages m3 WHERE m3.ticket_id = t.id ORDER BY m3.createdAt DESC LIMIT 1) as last_message
     FROM support_tickets t
     LEFT JOIN users u ON t.user_id = u.id
     ORDER BY t.updatedAt DESC`
  );
  return rows;
};

const getMessages = async (ticket_id) => {
  await ensureSupportTables();
  const [rows] = await dbPromise.query(
    `SELECT m.*, u.name as sender_name FROM support_messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.ticket_id = ? ORDER BY m.createdAt ASC`,
    [ticket_id]
  );
  return rows;
};

const addMessage = async (ticket_id, sender_role, sender_id, message) => {
  await ensureSupportTables();
  const [result] = await dbPromise.query(
    `INSERT INTO support_messages (ticket_id, sender_role, sender_id, message) VALUES (?, ?, ?, ?)`,
    [ticket_id, sender_role, sender_id, message]
  );
  await dbPromise.query(`UPDATE support_tickets SET updatedAt = NOW() WHERE id = ?`, [ticket_id]);
  return { id: result.insertId, ticket_id, sender_role, sender_id, message };
};

const getTicketById = async (ticket_id) => {
  await ensureSupportTables();
  const [rows] = await dbPromise.query(
    `SELECT t.*, u.name as user_name, u.email as user_email FROM support_tickets t LEFT JOIN users u ON t.user_id = u.id WHERE t.id = ?`,
    [ticket_id]
  );
  return rows[0] || null;
};

const updateTicketStatus = async (ticket_id, status) => {
  await ensureSupportTables();
  await dbPromise.query(`UPDATE support_tickets SET status = ? WHERE id = ?`, [status, ticket_id]);
};

module.exports = {
  createTicket,
  getTicketsByUser,
  getAllTickets,
  getMessages,
  addMessage,
  getTicketById,
  updateTicketStatus,
};
