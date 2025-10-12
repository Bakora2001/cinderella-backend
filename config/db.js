const mysql = require('mysql2/promise');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;
const params = new URL(dbUrl);

const db = mysql.createPool({
  host: params.hostname,
  user: params.username,
  password: params.password,
  database: params.pathname.replace('/', ''),
  port: params.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection
(async () => {
  try {
    const connection = await db.getConnection();
    console.log('Connected to Railway MySQL');
    connection.release();
  } catch (err) {
    console.error('Database connection failed:', err);
  }
})();

module.exports = db;