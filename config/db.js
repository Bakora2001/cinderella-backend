const mysql = require('mysql2');
require('dotenv').config();
const url = require('url');

const dbUrl = process.env.DATABASE_URL;
const params = new URL(dbUrl);

const db = mysql.createConnection({
  host: params.hostname,
  user: params.username,
  password: params.password,
  database: params.pathname.replace('/', ''),
  port: params.port
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to MySQL');
});

module.exports = db;
