// config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

(async () => {
  try {
    const conn = await db.getConnection();
    console.log("Connected to MySQL database");
    conn.release();
  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }
})();

module.exports = db;
