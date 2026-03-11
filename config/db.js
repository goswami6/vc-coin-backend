const mysql = require("mysql2");

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "crypto_db",
  port: parseInt(process.env.DB_PORT) || 3307,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// TiDB Cloud / Aiven / Railway require SSL in production
if (process.env.DB_SSL === "true") {
  dbConfig.ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
  };
}

const db = mysql.createPool(dbConfig);

// Test connection
db.getConnection((err, conn) => {
  if (err) {
    console.log("Database connection failed:", err.message);
  } else {
    console.log("MySQL Connected (pool)");
    conn.release();
  }
});

module.exports = db;