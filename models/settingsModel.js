const db = require('../config/db');
const dbPromise = db.promise();

const ensureSettingsTable = async () => {
  await dbPromise.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
  // Seed defaults
  const defaults = [
    ['vc_rate', '50'],
    ['deposit_upi_id', ''],
    ['deposit_qr_image', ''],
    ['deposit_min', '500'],
    ['deposit_max', '1000000'],
  ];
  for (const [k, v] of defaults) {
    await dbPromise.query(
      `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
      [k, v]
    );
  }
};

const getSetting = async (key) => {
  await ensureSettingsTable();
  const [rows] = await dbPromise.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1`,
    [key]
  );
  return rows[0] ? rows[0].setting_value : null;
};

const setSetting = async (key, value) => {
  await ensureSettingsTable();
  await dbPromise.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = ?`,
    [key, value, value]
  );
  return { key, value };
};

module.exports = { ensureSettingsTable, getSetting, setSetting };
