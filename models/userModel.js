const db = require('../config/db');
const crypto = require('crypto');

const dbPromise = db.promise();

const generateReferralCode = (userId) => {
  const hash = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VC${userId}${hash}`;
};

const createUser = async ({ name, email, mobile, passwordHash, referrerCode }) => {
  // Find referrer by code
  let referrerId = null;
  if (referrerCode) {
    const [refs] = await dbPromise.query(
      'SELECT id FROM users WHERE referral_code = ? LIMIT 1',
      [referrerCode]
    );
    if (refs.length > 0) referrerId = refs[0].id;
  }

  const [result] = await dbPromise.query(
    `INSERT INTO users (name, email, mobile, password, referred_by) VALUES (?, ?, ?, ?, ?)`,
    [name || null, email || null, mobile || null, passwordHash, referrerId]
  );

  // Generate unique referral code for new user
  const code = generateReferralCode(result.insertId);
  await dbPromise.query('UPDATE users SET referral_code = ? WHERE id = ?', [code, result.insertId]);

  return { id: result.insertId, name, email, mobile, referral_code: code };
};

const findUserByEmail = async (email) => {
  const [rows] = await dbPromise.query(`SELECT * FROM users WHERE email = ? LIMIT 1`, [email]);
  return rows[0];
};

const findUserByMobile = async (mobile) => {
  const [rows] = await dbPromise.query(`SELECT * FROM users WHERE mobile = ? LIMIT 1`, [mobile]);
  return rows[0];
};

const findUserById = async (id) => {
  const [rows] = await dbPromise.query(`SELECT * FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0];
};

// Get upline chain (up to 6 levels)
const getUplineChain = async (userId, maxLevels = 6) => {
  const chain = [];
  let currentId = userId;
  for (let i = 0; i < maxLevels; i++) {
    const [rows] = await dbPromise.query(
      'SELECT id, referred_by, name, email FROM users WHERE id = ? LIMIT 1',
      [currentId]
    );
    if (!rows[0] || !rows[0].referred_by) break;
    const referrer = await findUserById(rows[0].referred_by);
    if (!referrer) break;
    chain.push({ level: i + 1, user_id: referrer.id, name: referrer.name, email: referrer.email });
    currentId = referrer.id;
  }
  return chain;
};

// Get direct referrals
const getDirectReferrals = async (userId) => {
  const [rows] = await dbPromise.query(
    'SELECT id, name, email, mobile, created_at AS createdAt FROM users WHERE referred_by = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows;
};

// Admin: get all users
const getAllUsers = async () => {
  const [rows] = await dbPromise.query(
    `SELECT id, name, email, mobile, user_type, referral_code, is_blocked, created_at FROM users ORDER BY id DESC`
  );
  return rows;
};

// Admin: toggle block/unblock
const toggleBlockUser = async (userId) => {
  await dbPromise.query(
    `UPDATE users SET is_blocked = IF(is_blocked = 1, 0, 1) WHERE id = ?`,
    [userId]
  );
  const [rows] = await dbPromise.query('SELECT id, is_blocked FROM users WHERE id = ?', [userId]);
  return rows[0];
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserByMobile,
  findUserById,
  getUplineChain,
  getDirectReferrals,
  getAllUsers,
  toggleBlockUser,
};
