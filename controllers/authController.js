const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../config/db');
const { createUser, findUserByEmail, findUserByMobile, findUserById } = require('../models/userModel');
const { sendWelcomeEmail } = require('../utils/mailer');

const JWT_SECRET = process.env.JWT_SECRET || 'vc-coin-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const ensureUsersTable = async () => {
  const dbPromise = db.promise();

  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128),
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  const ensureColumn = async (column, definition) => {
    const [rows] = await dbPromise.query(
      `SELECT COUNT(*) as c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME=?`,
      [column]
    );
    if (rows[0]?.c === 0) {
      await dbPromise.query(`ALTER TABLE users ADD COLUMN ${definition}`);
    }
  };

  await ensureColumn('mobile', 'mobile VARCHAR(32)');
  await ensureColumn('user_type', "user_type VARCHAR(16) NOT NULL DEFAULT 'user'");
  await ensureColumn('referral_code', 'referral_code VARCHAR(32)');
  await ensureColumn('referred_by', 'referred_by INT DEFAULT NULL');
  await ensureColumn('is_blocked', 'is_blocked TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('wallet_balance', 'wallet_balance DECIMAL(12,2) DEFAULT 0');
  await ensureColumn('created_at', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

  // Add unique indexes separately (TiDB doesn't support ADD COLUMN ... UNIQUE in one statement)
  const ensureUniqueIndex = async (column) => {
    try {
      const [idx] = await dbPromise.query(
        `SELECT COUNT(*) as c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME=? AND NON_UNIQUE=0`,
        [column]
      );
      if (idx[0]?.c === 0) {
        await dbPromise.query(`ALTER TABLE users ADD UNIQUE INDEX idx_${column} (${column})`);
      }
    } catch { /* index already exists */ }
  };

  await ensureUniqueIndex('mobile');
  await ensureUniqueIndex('referral_code');
};

const register = async (req, res) => {
  console.log('Register request body:', req.body);
  try {
    await ensureUsersTable();

    const { name, email, mobile, password, confirmPassword, referral_code } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    if (!password || (!email && !mobile)) {
      return res.status(400).json({ message: 'Email or mobile and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Password and confirm password must match.' });
    }

    const existingUser = email ? await findUserByEmail(email) : await findUserByMobile(mobile);
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({ name, email, mobile, passwordHash, referrerCode: referral_code });

    const token = jwt.sign({ sub: user.id, email: user.email, mobile: user.mobile, user_type: 'user' }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Send welcome email (non-blocking — don't fail registration if email fails)
    if (email) {
      sendWelcomeEmail(email, name).catch((err) =>
        console.error('Welcome email failed:', err.message)
      );
    }

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Register error', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, mobile, password } = req.body;

    if (!password || (!email && !mobile)) {
      return res.status(400).json({ message: 'Email or mobile and password are required.' });
    }

    const user = email ? await findUserByEmail(email) : await findUserByMobile(mobile);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (user.is_blocked) {
      return res.status(403).json({ message: 'Your account has been blocked. Please contact support.' });
    }

    const token = jwt.sign({ sub: user.id, email: user.email, mobile: user.mobile, user_type: user.user_type || 'user' }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({ user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, user_type: user.user_type || 'user' }, token });
  } catch (error) {
    console.error('Login error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const me = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = decoded.email
      ? await findUserByEmail(decoded.email)
      : await findUserByMobile(decoded.mobile);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { password, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Me error', error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// In-memory OTP store (key: email, value: { otp, expiresAt })
const otpStore = new Map();

const forgotPassword = async (req, res) => {
  try {
    await ensureUsersTable();
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email.' });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 min expiry

    const { sendOtpEmail } = require('../utils/mailer');
    await sendOtpEmail(email, user.name || 'User', otp);

    res.json({ message: 'OTP sent to your email.' });
  } catch (error) {
    console.error('Forgot password error', error);
    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    const record = otpStore.get(email);
    if (!record) {
      return res.status(400).json({ message: 'No OTP requested for this email.' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    res.json({ message: 'OTP verified successfully.' });
  } catch (error) {
    console.error('Verify OTP error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const record = otpStore.get(email);
    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const dbP = db.promise();
    await dbP.query('UPDATE users SET password = ? WHERE email = ?', [passwordHash, email]);

    otpStore.delete(email);

    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset password error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const userId = decoded.sub;

    const { name, email, mobile } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required.' });

    const dbP = db.promise();
    const currentUser = await findUserById(userId);
    if (!currentUser) return res.status(404).json({ message: 'User not found.' });

    // Check email uniqueness if changed
    if (email && email !== currentUser.email) {
      const existing = await findUserByEmail(email);
      if (existing && existing.id !== userId) {
        return res.status(400).json({ message: 'Email already in use.' });
      }
    }

    // Check mobile uniqueness if changed
    if (mobile && mobile !== currentUser.mobile) {
      const existing = await findUserByMobile(mobile);
      if (existing && existing.id !== userId) {
        return res.status(400).json({ message: 'Mobile number already in use.' });
      }
    }

    await dbP.query('UPDATE users SET name = ?, email = ?, mobile = ? WHERE id = ?',
      [name.trim(), email || null, mobile || null, userId]);

    // Return updated user with fresh token
    const user = await findUserById(userId);
    const { password: _, ...safeUser } = user;

    const token = jwt.sign({ sub: user.id, email: user.email, mobile: user.mobile, user_type: user.user_type || 'user' }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({ message: 'Profile updated.', user: safeUser, token });
  } catch (error) {
    console.error('Update profile error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const changePassword = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const userId = decoded.sub;

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 10);
    const dbP = db.promise();
    await dbP.query('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  register,
  login,
  me,
  forgotPassword,
  verifyOtp,
  resetPassword,
  updateProfile,
  changePassword,
};
